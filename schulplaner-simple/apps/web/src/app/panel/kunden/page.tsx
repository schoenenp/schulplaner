import Link from "next/link";
import { euro, germanDate } from "@/lib/format";
import { db } from "@/server/db";

export const metadata = { title: "Kunden" };
export const dynamic = "force-dynamic";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = (await searchParams).q?.trim();
  const customers = await db.user.findMany({
    where: {
      role: "USER",
      ...(q
        ? {
            OR: [
              { email: { contains: q } },
              { schoolName: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      email: true,
      name: true,
      schoolName: true,
      createdAt: true,
      _count: { select: { books: { where: { isTemplate: false, frozenAt: null, deletedAt: null } } } },
      orders: { select: { totalAmount: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl">Kunden</h1>
        <form className="flex gap-2">
          <input className="input w-64" name="q" defaultValue={q} placeholder="Schule oder E-Mail" />
          <button className="btn-secondary" type="submit">Suchen</button>
        </form>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Schule</th>
              <th>E-Mail</th>
              <th>Planer</th>
              <th>Bestellungen</th>
              <th>Umsatz</th>
              <th>Letzte Bestellung</th>
              <th>Registriert</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((customer) => {
              const valid = customer.orders.filter((order) => order.status !== "CANCELED");
              return (
                <tr key={customer.id}>
                  <td>
                    <Link href={`/panel/kunden/${customer.id}`} className="font-medium text-brand underline">
                      {customer.schoolName ?? customer.name ?? "Ohne Namen"}
                    </Link>
                  </td>
                  <td>{customer.email}</td>
                  <td>{customer._count.books}</td>
                  <td>{valid.length}</td>
                  <td className="tabular-nums">{euro(valid.reduce((sum, order) => sum + order.totalAmount, 0))}</td>
                  <td>{germanDate(customer.orders[0]?.createdAt)}</td>
                  <td>{germanDate(customer.createdAt)}</td>
                </tr>
              );
            })}
            {customers.length === 0 && (
              <tr>
                <td colSpan={7} className="text-muted">Keine Kunden gefunden.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
