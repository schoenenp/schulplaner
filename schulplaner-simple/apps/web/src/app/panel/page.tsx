import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { euro, germanDate, orderNumber } from "@/lib/format";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { PaymentBadge, StatusBadge } from "@/components/status-badge";
import { db } from "@/server/db";
import { getPriceList, getTemplate } from "@/server/settings";

export const dynamic = "force-dynamic";

export default async function PanelHome() {
  const [byStatus, unpaid, recent, template, prices, coverCount] = await Promise.all([
    db.order.groupBy({ by: ["status"], _count: true }),
    db.order.aggregate({
      where: { paymentStatus: "OPEN", status: { not: "CANCELED" } },
      _count: true,
      _sum: { totalAmount: true },
    }),
    db.order.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    getTemplate(),
    getPriceList(),
    db.module.count({ where: { part: "COVER", visible: "PUBLIC", deletedAt: null } }),
  ]);
  const count = (status: string) => byStatus.find((entry) => entry.status === status)?._count ?? 0;
  const hasCover = template?.modules.some((entry) => entry.module.part === "COVER") ?? false;
  const hasWeeks = template?.modules.some((entry) => entry.module.type.name === "wochenplaner") ?? false;
  const setup = [
    { done: Boolean(template), label: "Standardplaner angelegt", href: "/panel/planer" },
    { done: hasCover, label: "Standardumschlag gewählt", href: "/panel/planer" },
    { done: hasWeeks, label: "Wochen-Doppelseite im Standardplaner", href: "/panel/planer" },
    { done: coverCount > 0, label: "Umschläge für Schulen freigegeben (optional)", href: "/panel/module" },
    { done: prices.priceTiers.length > 0, label: "Preise hinterlegt", href: "/panel/einstellungen" },
  ];

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl">Übersicht</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(["NEW", "IN_PRODUCTION", "SHIPPED"] as const).map((status) => (
          <Link key={status} href={`/panel/bestellungen?status=${status}`} className="card hover:border-brand">
            <p className="text-sm text-muted">{ORDER_STATUS_LABEL[status]}</p>
            <p className="text-3xl font-semibold">{count(status)}</p>
          </Link>
        ))}
        <Link href="/panel/bestellungen?status=UNPAID" className="card hover:border-brand">
          <p className="text-sm text-muted">Offene Rechnungen</p>
          <p className="text-3xl font-semibold">{unpaid._count}</p>
          <p className="text-sm text-muted">{euro(unpaid._sum.totalAmount ?? 0)}</p>
        </Link>
      </div>

      {setup.some((step) => !step.done) && (
        <section className="card flex flex-col gap-2">
          <h2 className="text-lg">Einrichtung</h2>
          {setup.map((step) => (
            <Link key={step.label} href={step.href} className="flex items-center gap-2 text-sm hover:text-brand">
              {step.done ? <CheckCircle2 className="size-4 text-emerald-600" /> : <Circle className="size-4 text-muted" />}
              {step.label}
            </Link>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg">Neueste Bestellungen</h2>
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Nr.</th>
                <th>Datum</th>
                <th>Schule</th>
                <th>Menge</th>
                <th>Summe</th>
                <th>Status</th>
                <th>Zahlung</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/panel/bestellungen/${order.id}`} className="font-medium text-brand underline">
                      {orderNumber(order.id)}
                    </Link>
                  </td>
                  <td>{germanDate(order.createdAt)}</td>
                  <td>{order.schoolName}</td>
                  <td>{order.quantity}</td>
                  <td className="tabular-nums">{euro(order.totalAmount)}</td>
                  <td><StatusBadge status={order.status} /></td>
                  <td><PaymentBadge status={order.paymentStatus} /></td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-muted">Noch keine Bestellungen.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
