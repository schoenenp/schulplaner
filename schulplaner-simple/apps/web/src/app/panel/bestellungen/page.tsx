import Link from "next/link";
import type { OrderStatus, Prisma } from "db";
import { euro, germanDate, orderNumber } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { PaymentBadge, StatusBadge } from "@/components/status-badge";
import { db } from "@/server/db";

export const metadata = { title: "Bestellungen" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "OPEN", label: "In Arbeit" },
  { key: "NEW", label: ORDER_STATUS_LABEL.NEW },
  { key: "IN_PRODUCTION", label: ORDER_STATUS_LABEL.IN_PRODUCTION },
  { key: "SHIPPED", label: ORDER_STATUS_LABEL.SHIPPED },
  { key: "COMPLETED", label: ORDER_STATUS_LABEL.COMPLETED },
  { key: "CANCELED", label: ORDER_STATUS_LABEL.CANCELED },
  { key: "UNPAID", label: "Unbezahlt" },
  { key: "ALL", label: "Alle" },
] as const;

function filterWhere(key: string): Prisma.OrderWhereInput {
  if (key === "ALL") return {};
  if (key === "UNPAID") return { paymentStatus: "OPEN", status: { not: "CANCELED" } };
  if (key === "OPEN") return { status: { in: ["NEW", "IN_PRODUCTION", "SHIPPED"] } };
  return { status: key as OrderStatus };
}

export default async function PanelOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const active = FILTERS.some((filter) => filter.key === params.status) ? params.status! : "OPEN";
  const q = params.q?.trim();
  const numeric = q?.replace(/^B-0*/i, "");
  const orders = await db.order.findMany({
    where: {
      ...filterWhere(active),
      ...(q
        ? {
            OR: [
              { schoolName: { contains: q, mode: "insensitive" } },
              { email: { contains: q } },
              ...(numeric && /^\d+$/.test(numeric) ? [{ id: Number(numeric) }] : []),
            ],
          }
        : {}),
    },
    orderBy: { createdAt: active === "OPEN" || active === "NEW" ? "asc" : "desc" },
    take: 200,
    include: { book: { select: { bookTitle: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Bestellungen</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1">
          {FILTERS.map((filter) => (
            <Link
              key={filter.key}
              href={`/panel/bestellungen?status=${filter.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                active === filter.key ? "bg-brand text-white" : "bg-white text-ink hover:bg-brand-soft"
              }`}
            >
              {filter.label}
            </Link>
          ))}
        </nav>
        <form className="flex gap-2">
          <input type="hidden" name="status" value={active} />
          <input className="input w-56" name="q" defaultValue={q} placeholder="Schule, E-Mail oder Nr." />
          <button className="btn-secondary" type="submit">Suchen</button>
        </form>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Nr.</th>
              <th>Eingang</th>
              <th>Schule</th>
              <th>Planer</th>
              <th>Menge</th>
              <th>Summe</th>
              <th>Druckdatei</th>
              <th>Status</th>
              <th>Zahlung</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/panel/bestellungen/${order.id}`} className="font-medium text-brand underline">
                    {orderNumber(order.id)}
                  </Link>
                </td>
                <td>{germanDate(order.createdAt)}</td>
                <td>
                  {order.schoolName}
                  <span className="block text-xs text-muted">{order.email}</span>
                </td>
                <td>{order.book.bookTitle}</td>
                <td>{order.quantity}</td>
                <td className="tabular-nums">{euro(order.totalAmount)}</td>
                <td>{order.printFileSrc ? "✓" : "–"}</td>
                <td><StatusBadge status={order.status} /></td>
                <td><PaymentBadge status={order.paymentStatus} /></td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={9} className="text-muted">Keine Bestellungen in dieser Ansicht.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
