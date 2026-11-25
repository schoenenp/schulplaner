import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { brand } from "@/brand";
import { addressLines, parseAddress } from "@/lib/address";
import { euro, germanDate, germanDateTime, orderNumber } from "@/lib/format";
import {
  ORDER_STATUS_LABEL,
  ORDER_STATUS_ORDER,
  ORDER_STATUS_SCHOOL_TEXT,
} from "@/lib/order-status";
import { regionName } from "@/lib/regions";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/server/access";
import { db } from "@/server/db";

export const metadata = { title: "Bestellung" };

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ neu?: string }>;
}) {
  const [{ id }, { neu }] = await Promise.all([params, searchParams]);
  const user = await requireUser(`/bestellungen/${id}`);
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) notFound();
  const order = await db.order.findFirst({
    where: { id: orderId, userId: user.id },
    include: {
      book: {
        include: {
          customDates: { orderBy: { date: "asc" } },
          modules: { where: { module: { part: "COVER" } }, include: { module: { select: { name: true } } } },
        },
      },
    },
  });
  if (!order) notFound();
  const reached = ORDER_STATUS_ORDER.indexOf(order.status);
  const stepDates = [order.createdAt, order.productionAt, order.shippedAt, order.completedAt];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/bestellungen" className="text-sm text-muted hover:text-ink">
          ← Alle Bestellungen
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl">Bestellung {orderNumber(order.id)}</h1>
          <StatusBadge status={order.status} />
        </div>
      </div>

      {neu && (
        <div className="card flex items-start gap-3 border-emerald-200 bg-emerald-50">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-700" />
          <div>
            <p className="font-semibold text-emerald-900">Vielen Dank für Ihre Bestellung!</p>
            <p className="text-sm text-emerald-900">
              Die Rechnung erhalten Sie separat. Den Status Ihrer Bestellung sehen Sie hier.
            </p>
          </div>
        </div>
      )}

      <section className="card flex flex-col gap-4">
        <p>{ORDER_STATUS_SCHOOL_TEXT[order.status]}</p>
        {order.status !== "CANCELED" && (
          <ol className="grid gap-3 sm:grid-cols-4">
            {ORDER_STATUS_ORDER.map((status, index) => (
              <li
                key={status}
                className={`rounded-lg border p-3 text-sm ${index <= reached ? "border-brand bg-brand-soft" : "border-line text-muted"}`}
              >
                <p className="font-medium">{ORDER_STATUS_LABEL[status]}</p>
                <p className="text-xs">{stepDates[index] ? germanDateTime(stepDates[index]) : "–"}</p>
              </li>
            ))}
          </ol>
        )}
        {order.trackingNumber && (
          <p className="text-sm">
            <span className="text-muted">Sendungsnummer:</span> {order.trackingNumber}
          </p>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card flex flex-col gap-2 text-sm">
          <h2 className="text-lg">Planer</h2>
          <p>
            {order.book.bookTitle}
            {order.book.subTitle ? ` – ${order.book.subTitle}` : ""}
          </p>
          <p className="text-muted">
            {germanDate(order.book.planStart)} – {germanDate(order.book.planEnd)} ·{" "}
            {regionName(order.book.region)}
          </p>
          <p className="text-muted">Umschlag: {order.book.modules[0]?.module.name ?? "–"}</p>
          <p className="text-muted">
            {brand.format}, {brand.binding}
          </p>
          {order.book.customDates.length > 0 && (
            <details>
              <summary className="cursor-pointer">{order.book.customDates.length} eigene Termine</summary>
              <ul className="mt-2">
                {order.book.customDates.map((entry) => (
                  <li key={entry.id}>
                    <span className="inline-block w-24 tabular-nums">{germanDate(entry.date)}</span>
                    {entry.name}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
        <section className="card flex flex-col gap-2 text-sm">
          <h2 className="text-lg">Rechnung</h2>
          <p>
            {order.quantity} × {euro(order.unitAmount)} + Versand {euro(order.shippingAmount)}
          </p>
          <p className="font-semibold">Gesamt {euro(order.totalAmount)} inkl. MwSt.</p>
          <p className="text-muted">Zahlung auf Rechnung</p>
          <div className="grid gap-4 pt-2 sm:grid-cols-2">
            <div>
              <p className="font-medium">Rechnungsadresse</p>
              {addressLines(parseAddress(order.billingAddress)).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <div>
              <p className="font-medium">Lieferadresse</p>
              {addressLines(parseAddress(order.shipAddress)).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        </section>
      </div>
      <p className="text-sm text-muted">
        Fragen zur Bestellung? {brand.company}, {brand.email}, {brand.phone}
      </p>
    </div>
  );
}
