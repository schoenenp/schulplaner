"use server";

import { revalidatePath } from "next/cache";
import { uploadStorageFiles } from "books-storage";
import type { OrderStatus } from "db";
import { brand } from "@/brand";
import { env } from "@/env";
import { orderNumber } from "@/lib/format";
import { logger } from "@/lib/logger";
import { NEXT_ORDER_STATUS, ORDER_STATUS_LABEL, canCancel } from "@/lib/order-status";
import { requireStaff } from "@/server/access";
import { db } from "@/server/db";
import { withGenerationLock } from "@/server/generation-lock";
import { HOLIDAY_FAILURE_MESSAGE, isHolidayFailure } from "@/server/holidays";
import { sendMailInBackground } from "@/server/mail";
import { pdfBookInclude, renderPrintPdf } from "@/server/pdf";

export type PanelFormState = { error?: string; ok?: string } | undefined;

const STATUS_TIMESTAMP: Partial<Record<OrderStatus, "productionAt" | "shippedAt" | "completedAt">> = {
  IN_PRODUCTION: "productionAt",
  SHIPPED: "shippedAt",
  COMPLETED: "completedAt",
};

function refresh(orderId: number) {
  revalidatePath(`/panel/bestellungen/${orderId}`);
  revalidatePath("/panel/bestellungen");
  revalidatePath("/panel");
}

export async function advanceOrder(
  orderId: number,
  _state: PanelFormState,
  formData: FormData,
): Promise<PanelFormState> {
  const staff = await requireStaff();
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { error: "Bestellung nicht gefunden." };
  const next = NEXT_ORDER_STATUS[order.status];
  if (!next) return { error: "Für diesen Status gibt es keinen nächsten Schritt." };
  const trackingNumber = String(formData.get("trackingNumber") ?? "").trim().slice(0, 100) || null;
  const stamp = STATUS_TIMESTAMP[next];

  // Guard on the current status so two staff clicks cannot skip a step.
  const updated = await db.order.updateMany({
    where: { id: orderId, status: order.status },
    data: {
      status: next,
      ...(stamp ? { [stamp]: new Date() } : {}),
      ...(next === "SHIPPED" && trackingNumber ? { trackingNumber } : {}),
    },
  });
  if (updated.count !== 1) return { error: "Die Bestellung wurde inzwischen geändert. Bitte neu laden." };
  await db.orderEvent.create({
    data: {
      orderId,
      actorId: staff.id,
      message: `Status: ${ORDER_STATUS_LABEL[next]}${next === "SHIPPED" && trackingNumber ? ` (Sendung ${trackingNumber})` : ""}`,
    },
  });

  if (next === "SHIPPED") {
    sendMailInBackground({
      to: order.email,
      subject: `Ihre Planer sind unterwegs (${orderNumber(order.id)})`,
      text: [
        "Guten Tag,",
        "",
        `Ihre Bestellung ${orderNumber(order.id)} wurde versendet.`,
        ...(trackingNumber ? [`Sendungsnummer: ${trackingNumber}`] : []),
        "",
        `Bestellstatus: ${env.APP_URL}/bestellungen/${order.id}`,
        "",
        `${brand.company} · ${brand.email}`,
      ].join("\n"),
    });
  }
  refresh(orderId);
  return { ok: `Status auf „${ORDER_STATUS_LABEL[next]}“ gesetzt.` };
}

export async function cancelOrder(orderId: number) {
  const staff = await requireStaff();
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || !canCancel(order.status)) return;
  const updated = await db.order.updateMany({
    where: { id: orderId, status: order.status },
    data: { status: "CANCELED", canceledAt: new Date() },
  });
  if (updated.count !== 1) return;
  await db.orderEvent.create({ data: { orderId, actorId: staff.id, message: "Bestellung storniert" } });
  sendMailInBackground({
    to: order.email,
    subject: `Bestellung ${orderNumber(order.id)} storniert`,
    text: [
      "Guten Tag,",
      "",
      `Ihre Bestellung ${orderNumber(order.id)} wurde storniert. Bei Fragen erreichen Sie uns unter ${brand.email} oder ${brand.phone}.`,
      "",
      brand.company,
    ].join("\n"),
  });
  refresh(orderId);
}

export async function saveBilling(
  orderId: number,
  _state: PanelFormState,
  formData: FormData,
): Promise<PanelFormState> {
  const staff = await requireStaff();
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) return { error: "Bestellung nicht gefunden." };
  const invoiceNumber = String(formData.get("invoiceNumber") ?? "").trim().slice(0, 60) || null;
  const paid = formData.get("paid") === "on";
  const internalNote = String(formData.get("internalNote") ?? "").trim().slice(0, 5000) || null;
  await db.order.update({
    where: { id: orderId },
    data: {
      invoiceNumber,
      internalNote,
      paymentStatus: paid ? "PAID" : "OPEN",
      paidAt: paid ? (order.paidAt ?? new Date()) : null,
    },
  });
  const changes = [
    invoiceNumber !== order.invoiceNumber && `Rechnungsnummer ${invoiceNumber ?? "entfernt"}`,
    paid !== (order.paymentStatus === "PAID") && (paid ? "als bezahlt markiert" : "als offen markiert"),
  ].filter(Boolean);
  if (changes.length > 0) {
    await db.orderEvent.create({ data: { orderId, actorId: staff.id, message: `Rechnung: ${changes.join(", ")}` } });
  }
  refresh(orderId);
  return { ok: "Gespeichert." };
}

/** Build the print file from the frozen planner and keep it with the order. */
export async function generatePrintFile(
  orderId: number,
  _state: PanelFormState,
): Promise<PanelFormState> {
  const staff = await requireStaff();
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { book: { include: pdfBookInclude } },
  });
  if (!order) return { error: "Bestellung nicht gefunden." };
  try {
    const result = await withGenerationLock(`print:${orderId}`, async () => {
      const { pdf, pageCount, checks } = await renderPrintPdf(order.book);
      const [file] = await uploadStorageFiles([{ data: pdf, name: `${orderNumber(order.id)}.pdf` }]);
      if (!file) throw new Error("Upload failed");
      await db.order.update({
        where: { id: orderId },
        data: { printFileSrc: file.src, printPageCount: pageCount, printGeneratedAt: new Date() },
      });
      await db.orderEvent.create({
        data: { orderId, actorId: staff.id, message: `Druckdatei erstellt (${pageCount ?? "?"} Seiten)` },
      });
      return checks.filter((check) => check.status === "warning").map((check) => check.message);
    });
    if (result.busy) return { error: "Die Druckdatei wird bereits erstellt." };
    refresh(orderId);
    return {
      ok: result.value.length
        ? `Druckdatei erstellt. Hinweise: ${result.value.join(" ")}`
        : "Druckdatei erstellt.",
    };
  } catch (error) {
    logger.error("print_file_generation_failed", { orderId, error });
    return {
      error: isHolidayFailure(error)
        ? HOLIDAY_FAILURE_MESSAGE
        : `Die Druckdatei konnte nicht erstellt werden: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
