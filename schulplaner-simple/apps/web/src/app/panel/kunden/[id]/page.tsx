import Link from "next/link";
import { notFound } from "next/navigation";
import { addressLines, parseAddress } from "@/lib/address";
import { euro, germanDate, germanDateTime, orderNumber } from "@/lib/format";
import { regionName } from "@/lib/regions";
import { PaymentBadge, StatusBadge } from "@/components/status-badge";
import { db } from "@/server/db";

export const metadata = { title: "Kunde" };
export const dynamic = "force-dynamic";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const customer = await db.user.findUnique({
    where: { id },
    include: {
      orders: { orderBy: { createdAt: "desc" }, include: { book: { select: { bookTitle: true } } } },
      books: {
        where: { isTemplate: false, frozenAt: null, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        include: { _count: { select: { customDates: true } } },
      },
    },
  });
  if (!customer) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/panel/kunden" className="text-sm text-muted hover:text-ink">← Kunden</Link>
        <h1 className="text-3xl">{customer.schoolName ?? customer.name ?? customer.email}</h1>
        <p className="text-sm text-muted">
          {customer.email} {customer.phone && `· ${customer.phone}`} · registriert {germanDateTime(customer.createdAt)}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card text-sm">
          <h2 className="text-lg">Rechnungsadresse (zuletzt)</h2>
          {addressLines(parseAddress(customer.billingAddress)).map((line) => <p key={line}>{line}</p>)}
          {!customer.billingAddress && <p className="text-muted">–</p>}
        </section>
        <section className="card text-sm">
          <h2 className="text-lg">Lieferadresse (zuletzt)</h2>
          {addressLines(parseAddress(customer.shipAddress)).map((line) => <p key={line}>{line}</p>)}
          {!customer.shipAddress && <p className="text-muted">–</p>}
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg">Bestellungen</h2>
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr><th>Nr.</th><th>Datum</th><th>Planer</th><th>Menge</th><th>Summe</th><th>Status</th><th>Zahlung</th></tr>
            </thead>
            <tbody>
              {customer.orders.map((order) => (
                <tr key={order.id}>
                  <td><Link href={`/panel/bestellungen/${order.id}`} className="font-medium text-brand underline">{orderNumber(order.id)}</Link></td>
                  <td>{germanDate(order.createdAt)}</td>
                  <td>{order.book.bookTitle}</td>
                  <td>{order.quantity}</td>
                  <td className="tabular-nums">{euro(order.totalAmount)}</td>
                  <td><StatusBadge status={order.status} /></td>
                  <td><PaymentBadge status={order.paymentStatus} /></td>
                </tr>
              ))}
              {customer.orders.length === 0 && (
                <tr><td colSpan={7} className="text-muted">Noch keine Bestellungen.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg">Planer in Bearbeitung</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {customer.books.map((book) => (
            <div key={book.id} className="card text-sm">
              <p className="font-medium">{book.bookTitle}{book.subTitle ? ` – ${book.subTitle}` : ""}</p>
              <p className="text-muted">
                {germanDate(book.planStart)} – {germanDate(book.planEnd)} · {regionName(book.region)} · {book._count.customDates} Termine
              </p>
              <p className="text-xs text-muted">zuletzt geändert {germanDateTime(book.updatedAt)}</p>
            </div>
          ))}
          {customer.books.length === 0 && <p className="text-sm text-muted">Keine.</p>}
        </div>
      </section>
    </div>
  );
}
