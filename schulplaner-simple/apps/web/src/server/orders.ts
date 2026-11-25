import "server-only";
import type { z } from "zod";
import { brand } from "@/brand";
import { env } from "@/env";
import { addressLines, type OrderFormSchema } from "@/lib/address";
import { euro, germanDate, orderNumber } from "@/lib/format";
import { quote } from "@/lib/pricing";
import { regionName } from "@/lib/regions";
import { db } from "@/server/db";
import { sendMailInBackground } from "@/server/mail";
import { findOwnPlanner, freezePlanner, syncPlannerContent } from "@/server/planner";
import { getPriceList } from "@/server/settings";

export class OrderRejectedError extends Error {}

type OrderInput = z.infer<typeof OrderFormSchema>;

/** Repeated clicks within this window return the order just placed. */
const DUPLICATE_WINDOW_MS = 60_000;

/**
 * Place an order straight into fulfillment: freeze the planner, price it from
 * the current list and record it as NEW. There is no review step.
 */
export async function placeOrder(userId: string, bookId: string, input: OrderInput) {
  const planner = await findOwnPlanner(userId, bookId);
  if (!planner) throw new OrderRejectedError("Planer nicht gefunden.");
  if (!planner.bookTitle?.trim() || !planner.planEnd) {
    throw new OrderRejectedError("Bitte zuerst die Planerinfo vollständig ausfüllen.");
  }

  const recent = await db.order.findFirst({
    where: {
      userId,
      sourceBookId: bookId,
      quantity: input.quantity,
      createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (recent) return recent.id;

  const prices = await getPriceList();
  const amounts = quote(input.quantity, prices);
  if (!amounts) {
    throw new OrderRejectedError(`Die Mindestbestellmenge beträgt ${prices.minQuantity} Stück.`);
  }

  const book = await syncPlannerContent(planner);
  const order = await db.$transaction(async (tx) => {
    const snapshot = await freezePlanner(tx, book);
    const created = await tx.order.create({
      data: {
        userId,
        sourceBookId: book.id,
        bookId: snapshot.id,
        quantity: amounts.quantity,
        unitAmount: amounts.unitAmount,
        shippingAmount: amounts.shippingAmount,
        totalAmount: amounts.totalAmount,
        vatBasisPoints: prices.vatBasisPoints,
        email: input.email,
        phone: input.phone,
        schoolName: input.schoolName,
        billingAddress: input.billing,
        shipAddress: input.shipping,
        customerNote: input.customerNote,
        events: {
          create: { actorId: userId, message: "Bestellung eingegangen" },
        },
      },
      select: { id: true },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        schoolName: input.schoolName,
        phone: input.phone ?? null,
        billingAddress: input.billing,
        shipAddress: input.shipping,
      },
    });
    return created;
  });

  const number = orderNumber(order.id);
  const cover = book.modules.find((entry) => entry.module.part === "COVER");
  const summary = [
    `Bestellnummer: ${number}`,
    `Planer: ${book.bookTitle}${book.subTitle ? ` – ${book.subTitle}` : ""}`,
    `Zeitraum: ${germanDate(book.planStart)} bis ${germanDate(book.planEnd)}`,
    `Bundesland: ${regionName(book.region)}`,
    `Umschlag: ${cover?.module.name ?? "–"}`,
    `Eigene Termine: ${book.customDates.length}`,
    `Menge: ${amounts.quantity} × ${euro(amounts.unitAmount)}`,
    `Versand: ${euro(amounts.shippingAmount)}`,
    `Gesamt: ${euro(amounts.totalAmount)} (inkl. ${euro(amounts.vatAmount)} MwSt.)`,
    "",
    "Lieferadresse:",
    ...addressLines(input.shipping),
  ].join("\n");

  sendMailInBackground({
    to: input.email,
    subject: `Ihre Bestellung ${number} bei ${brand.name}`,
    text: [
      "Guten Tag,",
      "",
      "vielen Dank für Ihre Bestellung. Wir bereiten Ihre Planer jetzt für den Druck vor.",
      "Die Rechnung erhalten Sie separat.",
      "",
      summary,
      "",
      `Bestellstatus: ${env.APP_URL}/bestellungen/${order.id}`,
      "",
      `${brand.company} · ${brand.email} · ${brand.phone}`,
    ].join("\n"),
  });
  if (env.ORDER_NOTIFY_EMAIL) {
    sendMailInBackground({
      to: env.ORDER_NOTIFY_EMAIL,
      replyTo: input.email,
      subject: `Neue Bestellung ${number}: ${input.schoolName}`,
      text: [summary, "", `Panel: ${env.APP_URL}/panel/bestellungen/${order.id}`].join("\n"),
    });
  }
  return order.id;
}
