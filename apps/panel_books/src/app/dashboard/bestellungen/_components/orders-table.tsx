"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/16/solid";

import { api } from "@/trpc/react";
import LoadingSpinner from "@/app/_components/loading-spinner";
import StatusBadge from "@/app/_components/status-badge";
import { formatCents, formatDate } from "@/util/format";
import {
  DELIVERY_STATUS_META,
  ORDER_STATUS_META,
  PAYMENT_STATUS_META,
} from "@/util/status-labels";

const STATUS_FILTERS = [
  { value: "", label: "Alle Status" },
  { value: "PENDING", label: "Offen" },
  { value: "COMPLETED", label: "Abgeschlossen" },
  { value: "SHIPPED", label: "Versendet" },
  { value: "CANCELED", label: "Storniert" },
  { value: "FAILED", label: "Fehlgeschlagen" },
] as const;

type OrderStatusFilter =
  | "PENDING"
  | "COMPLETED"
  | "SHIPPED"
  | "CANCELED"
  | "FAILED"
  | undefined;

export default function OrdersTable() {
  const router = useRouter();
  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<OrderStatusFilter>(undefined);
  const [page, setPage] = useState(1);

  const overview = api.shopOrder.getOverview.useQuery();
  const orders = api.shopOrder.getAll.useQuery(
    { query, status, page, pageSize: 20 },
    { placeholderData: keepPreviousData },
  );

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchDraft.trim() === "" ? undefined : searchDraft.trim());
    setPage(1);
  }

  const items = orders.data?.items ?? [];
  const pageCount = orders.data?.pageCount ?? 1;

  return (
    <div className="flex flex-col gap-6">
      <section className="dashboard-metric-grid grid gap-4">
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Bestellungen gesamt
          </p>
          <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {overview.data?.totalOrders ?? "–"}
          </p>
          <p className="mt-2 text-sm text-pirrot-blue-100/70">
            {overview.data ? `${overview.data.monthOrders} in diesem Monat` : ""}
          </p>
        </div>
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Offen
          </p>
          <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {overview.data?.byStatus.PENDING ?? 0}
          </p>
          <p className="mt-2 text-sm text-pirrot-blue-100/70">
            Warten auf Abschluss
          </p>
        </div>
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Umsatz (Monat)
          </p>
          <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {overview.data
              ? formatCents(overview.data.monthRevenueCents)
              : "–"}
          </p>
          <p className="mt-2 text-sm text-pirrot-blue-100/70">
            Erfolgreiche Zahlungen
          </p>
        </div>
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Offene Lieferungen
          </p>
          <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {overview.data?.openShipments ?? 0}
          </p>
          <p className="mt-2 text-sm text-pirrot-blue-100/70">
            Noch nicht versendet
          </p>
        </div>
      </section>

      <section className="glass-card-soft flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <form onSubmit={submitSearch} className="relative w-full lg:max-w-md">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-pirrot-blue-300/70" />
            <input
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Suche nach Auftrag, E-Mail oder Planer …"
              className="soft-input soft-input-leading"
            />
          </form>
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map((filter) => {
              const isActive = (status ?? "") === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => {
                    setStatus(
                      filter.value === ""
                        ? undefined
                        : filter.value,
                    );
                    setPage(1);
                  }}
                  className={
                    isActive
                      ? "btn-primary px-3 py-1.5 text-sm"
                      : "btn-secondary px-3 py-1.5 text-sm"
                  }
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>

        {orders.isPending ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-pirrot-blue-100/70">
            Keine Bestellungen gefunden.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-pirrot-blue-200/10 text-xs uppercase tracking-wide text-pirrot-blue-200/70">
                  <th className="px-3 py-3 font-semibold">Auftrag</th>
                  <th className="px-3 py-3 font-semibold">Kunde</th>
                  <th className="px-3 py-3 font-semibold">Planer</th>
                  <th className="px-3 py-3 font-semibold">Betrag</th>
                  <th className="px-3 py-3 font-semibold">Zahlung</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Versand</th>
                  <th className="px-3 py-3 font-semibold">Datum</th>
                </tr>
              </thead>
              <tbody>
                {items.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() =>
                      router.push(
                        `/dashboard/bestellungen/manage?orderId=${order.id}`,
                      )
                    }
                    className="cursor-pointer border-b border-pirrot-blue-200/5 text-pirrot-blue-50 transition hover:bg-pirrot-blue-950/60"
                  >
                    <td className="px-3 py-3 font-semibold text-white">
                      {order.orderKey ?? `#${order.id}`}
                      {order.partnerOrder ? (
                        <span className="ml-2 rounded-full border border-success-400/25 bg-success-950/35 px-2 py-0.5 text-[10px] font-semibold uppercase text-success-300">
                          Partner
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      {order.user?.email ?? "Gast"}
                    </td>
                    <td className="max-w-52 truncate px-3 py-3">
                      {order.bookOrder?.book.name ??
                        order.bookOrder?.book.bookTitle ??
                        "–"}
                      {order.bookOrder
                        ? ` · ${order.bookOrder.quantity} Stk.`
                        : ""}
                    </td>
                    <td className="px-3 py-3 font-semibold text-white">
                      {order.bookOrder?.payment
                        ? formatCents(
                            order.bookOrder.payment.total,
                            order.bookOrder.payment.currency,
                          )
                        : "–"}
                    </td>
                    <td className="px-3 py-3">
                      {order.bookOrder?.payment ? (
                        <StatusBadge
                          status={order.bookOrder.payment.status}
                          map={PAYMENT_STATUS_META}
                        />
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge
                        status={order.status}
                        map={ORDER_STATUS_META}
                      />
                    </td>
                    <td className="px-3 py-3">
                      {order.shipping ? (
                        <StatusBadge
                          status={order.shipping.status}
                          map={DELIVERY_STATUS_META}
                        />
                      ) : (
                        <span className="text-pirrot-blue-100/50">–</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {formatDate(order.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-pirrot-blue-200/10 pt-4">
          <p className="text-sm text-pirrot-blue-100/70">
            Seite {page} von {pageCount}
            {orders.data ? ` · ${orders.data.total} Bestellungen` : ""}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="btn-secondary px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Vorherige Seite"
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
              disabled={page >= pageCount}
              className="btn-secondary px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Nächste Seite"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
