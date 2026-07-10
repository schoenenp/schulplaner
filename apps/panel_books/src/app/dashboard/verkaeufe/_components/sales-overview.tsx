"use client";

import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";

import { api } from "@/trpc/react";
import LoadingSpinner from "@/app/_components/loading-spinner";
import StatusBadge from "@/app/_components/status-badge";
import { formatCents } from "@/util/format";
import { PARTNER_ORDER_STATUS_META } from "@/util/status-labels";

const MONTH_LABELS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export default function SalesOverview() {
  const now = new Date();
  const [cycleYear, setCycleYear] = useState(now.getUTCFullYear());
  const [cycleMonth, setCycleMonth] = useState(now.getUTCMonth() + 1);

  const sales = api.fulfillment.getSalesOverview.useQuery(
    { cycleYear, cycleMonth },
    { placeholderData: keepPreviousData },
  );

  const yearOptions = Array.from(
    { length: now.getUTCFullYear() - 2024 + 1 },
    (_, index) => 2024 + index,
  );

  const data = sales.data;
  const statusEntries = data
    ? Object.entries(data.byStatus).sort((a, b) => b[1] - a[1])
    : [];
  const maxStatusCount = statusEntries.reduce(
    (acc, entry) => Math.max(acc, entry[1]),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="glass-card-soft flex flex-wrap items-end gap-4 p-5">
        <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
          Jahr
          <select
            value={cycleYear}
            onChange={(event) => setCycleYear(Number(event.target.value))}
            className="soft-input w-32"
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
          Monat
          <select
            value={cycleMonth}
            onChange={(event) => setCycleMonth(Number(event.target.value))}
            className="soft-input w-44"
          >
            {MONTH_LABELS.map((label, index) => (
              <option key={label} value={index + 1}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p className="pb-3 text-sm text-pirrot-blue-100/60">
          Abrechnungszyklus {MONTH_LABELS[cycleMonth - 1]} {cycleYear}
        </p>
      </section>

      {sales.isPending ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : !data ? (
        <p className="py-16 text-center text-sm text-pirrot-blue-100/70">
          Keine Daten für diesen Zyklus.
        </p>
      ) : (
        <>
          <section className="dashboard-metric-grid grid gap-4">
            <div className="metric-card">
              <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
                Partner-Bestellungen
              </p>
              <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
                {data.orderCount}
              </p>
              <p className="mt-2 text-sm text-pirrot-blue-100/70">
                {data.adjustedOrderCount} mit Betragsanpassung
              </p>
            </div>
            <div className="metric-card">
              <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
                Umsatz gesamt
              </p>
              <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
                {formatCents(data.totals.grandTotalAmount)}
              </p>
              <p className="mt-2 text-sm text-pirrot-blue-100/70">
                Basis + Zusatzmodule
              </p>
            </div>
            <div className="metric-card">
              <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
                Basisumsatz
              </p>
              <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
                {formatCents(data.totals.baseTotalAmount)}
              </p>
            </div>
            <div className="metric-card">
              <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
                Zusatzmodule
              </p>
              <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
                {formatCents(data.totals.addOnTotalAmount)}
              </p>
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            <section className="glass-card-soft flex flex-col gap-4 p-5">
              <h4 className="text-lg font-bold text-white">Statusverteilung</h4>
              {statusEntries.length === 0 ? (
                <p className="text-sm text-pirrot-blue-100/70">
                  Keine Bestellungen in diesem Zyklus.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {statusEntries.map(([status, count]) => (
                    <li key={status} className="flex items-center gap-3">
                      <div className="w-44 shrink-0">
                        <StatusBadge
                          status={status}
                          map={PARTNER_ORDER_STATUS_META}
                        />
                      </div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-pirrot-blue-950/70">
                        <div
                          className="h-full rounded-full bg-pirrot-blue-400"
                          style={{
                            width: `${
                              maxStatusCount > 0
                                ? Math.round((count / maxStatusCount) * 100)
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <span className="w-8 text-right text-sm font-bold text-white">
                        {count}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="glass-card-soft flex flex-col gap-4 p-5">
              <h4 className="text-lg font-bold text-white">Top-Partner</h4>
              {data.topPartners.length === 0 ? (
                <p className="text-sm text-pirrot-blue-100/70">
                  Keine Partner mit Bestellungen in diesem Zyklus.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.topPartners.map((entry, index) => (
                    <li
                      key={entry.partnerUserId}
                      className="field-shell flex items-center justify-between gap-3 p-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pirrot-blue-500 text-xs font-black text-white">
                          {index + 1}
                        </span>
                        <span className="truncate text-sm font-semibold text-white">
                          {entry.partner?.email ??
                            entry.partner?.name ??
                            entry.partnerUserId}
                        </span>
                      </div>
                      <span className="shrink-0 text-sm text-pirrot-blue-100/75">
                        {entry.orderCount} Bestellungen
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
