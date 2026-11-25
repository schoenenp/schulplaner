import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { addressLines, parseAddress } from "@/lib/address";
import { euro, germanDate, germanDateTime, orderNumber } from "@/lib/format";
import { canCancel } from "@/lib/order-status";
import { regionName } from "@/lib/regions";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { PaymentBadge, StatusBadge } from "@/components/status-badge";
import { db } from "@/server/db";
import { cancelOrder } from "../actions";
import { AdvanceForm, BillingForm, PrintFileForm } from "../_components/order-actions";

export const metadata = { title: "Bestellung" };
export const dynamic = "force-dynamic";

export default async function PanelOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId)) notFound();
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { id: true, email: true } },
      events: { orderBy: { createdAt: "desc" }, include: { actor: { select: { email: true } } } },
      book: {
        include: {
          customDates: { orderBy: { date: "asc" } },
          modules: { orderBy: { idx: "asc" }, include: { module: { include: { type: true } } } },
        },
      },
    },
  });
  if (!order) notFound();
  const cover = order.book.modules.find((entry) => entry.module.part === "COVER");
  const content = order.book.modules.filter((entry) => entry.module.part !== "COVER");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/panel/bestellungen" className="text-sm text-muted hover:text-ink">← Bestellungen</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl">{orderNumber(order.id)}</h1>
          <StatusBadge status={order.status} />
          <PaymentBadge status={order.paymentStatus} />
        </div>
        <p className="text-sm text-muted">
          Eingegangen {germanDateTime(order.createdAt)} ·{" "}
          <Link href={`/panel/kunden/${order.user.id}`} className="underline">{order.schoolName}</Link>
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <section className="card flex flex-col gap-3">
            <h2 className="text-lg">Druckdatei</h2>
            {order.printFileSrc ? (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <a href={`/api/panel/bestellungen/${order.id}/druckdatei`} className="btn-primary">
                  <Download className="size-4" /> PDF herunterladen
                </a>
                <span className="text-muted">
                  {order.printPageCount} Seiten · erstellt {germanDateTime(order.printGeneratedAt)}
                </span>
              </div>
            ) : (
              <p className="text-sm text-muted">Noch nicht erstellt. Die Datei wird aus dem eingefrorenen Planerstand gebaut.</p>
            )}
            <PrintFileForm orderId={order.id} hasFile={Boolean(order.printFileSrc)} />
          </section>

          <section className="card grid gap-4 text-sm md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg">Planer</h2>
              <p className="font-medium">
                {order.book.bookTitle}
                {order.book.subTitle ? ` – ${order.book.subTitle}` : ""}
              </p>
              <p>{germanDate(order.book.planStart)} – {germanDate(order.book.planEnd)}</p>
              <p>Ferien: {regionName(order.book.region)}</p>
              <p>Format {order.book.format}</p>
              <p>Umschlag: {cover?.module.name ?? "–"}</p>
              <p className="pt-2 font-medium">Inhalt</p>
              <ol className="list-decimal pl-5 text-muted">
                {content.map((entry) => (
                  <li key={entry.id}>{entry.module.name} <span className="text-xs">({entry.module.type.name})</span></li>
                ))}
              </ol>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg">Eigene Termine ({order.book.customDates.length})</h2>
              <ul className="max-h-64 overflow-y-auto text-muted">
                {order.book.customDates.map((entry) => (
                  <li key={entry.id}>
                    <span className="inline-block w-24 tabular-nums">{germanDate(entry.date)}</span>
                    {entry.name}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="card grid gap-4 text-sm md:grid-cols-3">
            <div>
              <h2 className="text-lg">Kontakt</h2>
              <p>{order.schoolName}</p>
              <p><a className="underline" href={`mailto:${order.email}`}>{order.email}</a></p>
              {order.phone && <p>{order.phone}</p>}
              {order.customerNote && (
                <p className="mt-2 rounded bg-amber-50 p-2 text-amber-900">„{order.customerNote}“</p>
              )}
            </div>
            <div>
              <h2 className="text-lg">Rechnungsadresse</h2>
              {addressLines(parseAddress(order.billingAddress)).map((line) => <p key={line}>{line}</p>)}
            </div>
            <div>
              <h2 className="text-lg">Lieferadresse</h2>
              {addressLines(parseAddress(order.shipAddress)).map((line) => <p key={line}>{line}</p>)}
              {order.trackingNumber && <p className="mt-2">Sendung: {order.trackingNumber}</p>}
            </div>
          </section>

          <section className="card flex flex-col gap-2 text-sm">
            <h2 className="text-lg">Verlauf</h2>
            <ul className="flex flex-col gap-1">
              {order.events.map((event) => (
                <li key={event.id} className="flex gap-3">
                  <span className="w-36 shrink-0 text-muted">{germanDateTime(event.createdAt)}</span>
                  <span>
                    {event.message}
                    {event.actor?.email && <span className="text-muted"> · {event.actor.email}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <section className="card flex flex-col gap-3">
            <h2 className="text-lg">Nächster Schritt</h2>
            <AdvanceForm orderId={order.id} status={order.status} />
            {canCancel(order.status) && (
              <form action={cancelOrder.bind(null, order.id)} className="border-t border-line pt-3">
                <ConfirmSubmit question="Bestellung wirklich stornieren? Die Schule wird per E-Mail informiert." className="btn-danger">
                  Stornieren
                </ConfirmSubmit>
              </form>
            )}
          </section>
          <section className="card flex flex-col gap-2 text-sm">
            <h2 className="text-lg">Betrag</h2>
            <p>{order.quantity} × {euro(order.unitAmount)} = {euro(order.unitAmount * order.quantity)}</p>
            <p>Versand {euro(order.shippingAmount)}</p>
            <p className="font-semibold">Gesamt {euro(order.totalAmount)} (brutto, {order.vatBasisPoints / 100} % MwSt.)</p>
          </section>
          <section className="card flex flex-col gap-3">
            <h2 className="text-lg">Rechnung</h2>
            <BillingForm
              orderId={order.id}
              invoiceNumber={order.invoiceNumber}
              paid={order.paymentStatus === "PAID"}
              internalNote={order.internalNote}
            />
          </section>
        </aside>
      </div>
    </div>
  );
}
