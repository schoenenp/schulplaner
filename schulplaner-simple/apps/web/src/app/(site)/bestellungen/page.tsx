import Link from "next/link";
import { euro, germanDate, orderNumber } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/server/access";
import { db } from "@/server/db";

export const metadata = { title: "Bestellungen" };

export default async function OrdersPage() {
  const user = await requireUser("/bestellungen");
  const orders = await db.order.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { book: { select: { bookTitle: true, planStart: true, planEnd: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Bestellungen</h1>
      {orders.length === 0 ? (
        <p className="card text-muted">
          Noch keine Bestellungen. <Link href="/planer" className="text-brand underline">Zum Planer</Link>
        </p>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Datum</th>
                <th>Planer</th>
                <th>Menge</th>
                <th>Summe</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/bestellungen/${order.id}`} className="font-medium text-brand underline">
                      {orderNumber(order.id)}
                    </Link>
                  </td>
                  <td>{germanDate(order.createdAt)}</td>
                  <td>
                    {order.book.bookTitle}
                    <span className="block text-xs text-muted">
                      {germanDate(order.book.planStart)} – {germanDate(order.book.planEnd)}
                    </span>
                  </td>
                  <td>{order.quantity}</td>
                  <td className="tabular-nums">{euro(order.totalAmount)}</td>
                  <td>
                    <StatusBadge status={order.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
