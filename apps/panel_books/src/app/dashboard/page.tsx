import Link from "next/link";
import {
  ArrowTrendingUpIcon,
  ChartBarIcon,
  DocumentMagnifyingGlassIcon,
  DocumentTextIcon,
  EyeSlashIcon,
  PlusIcon,
  RectangleGroupIcon,
  ShoppingCartIcon,
  SparklesIcon,
  TagIcon,
  TruckIcon,
  UsersIcon,
} from "@heroicons/react/16/solid";

import { auth } from "@/server/auth";
import { api, HydrateClient } from "@/trpc/server";
import { formatCents } from "@/util/format";
import LoginPage from "../_components/login-page";
import DashboardShell from "./_components/dashboard-shell";

const visibilityTone: Record<string, string> = {
  PUBLIC: "text-success-300 bg-success-950/35 border-success-400/25",
  SHARED:
    "text-pirrot-blue-200 bg-pirrot-blue-950/55 border-pirrot-blue-300/20",
  PRIVATE: "text-warning-200 bg-warning-950/35 border-warning-400/25",
};

const partLabels: Record<string, string> = {
  DEFAULT: "Standard",
  PLANNER: "Planer",
  COVER: "Umschlag",
  BINDING: "Bindung",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
  }).format(date);
}

function percent(value: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.round((value / total) * 100)}%`;
}

export default async function Dashboard() {
  const session = await auth();

  if (!session) {
    return <LoginPage />;
  }

  const [insights, shopOverview, customerOverview, fulfillmentQueue] =
    await Promise.all([
      api.module.getInsights(),
      api.shopOrder.getOverview(),
      api.customer.getOverview(),
      api.fulfillment.getQueueCount(),
    ]);

  const {
    summary,
    visibilityBreakdown,
    partBreakdown,
    topTypes,
    recentModules,
  } = insights;

  const totalVisibleModules = visibilityBreakdown
    .filter((entry) => entry.visibility !== "PRIVATE")
    .reduce((acc, entry) => acc + entry.count, 0);

  return (
    <HydrateClient>
      <DashboardShell
        title="Control Dashboard"
        eyebrow="Staff overview"
        description="Die zentrale Arbeitsoberfläche für das Staff-Team: Shop-Bestellungen, Partner-Fulfillment, Kundenkonten und der komplette Katalog auf einen Blick."
        actions={
          <>
            <Link href="/dashboard/module/manage" className="btn-primary gap-2">
              <PlusIcon className="size-4" />
              Modul anlegen
            </Link>
            <Link href="/dashboard/module" className="btn-secondary">
              Modulverwaltung
            </Link>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          <section className="dashboard-metric-grid grid gap-4">
            <Link href="/dashboard/bestellungen" className="metric-card">
              <div className="flex items-center justify-between">
                <span className="badge-shell">Bestellungen</span>
                <ShoppingCartIcon className="size-5 text-pirrot-blue-200/80" />
              </div>
              <p className="mt-5 text-3xl font-black text-white sm:text-4xl">
                {shopOverview.byStatus.PENDING ?? 0}
              </p>
              <p className="mt-2 text-sm text-pirrot-blue-100/70">
                offen · {shopOverview.totalOrders} gesamt
              </p>
            </Link>

            <Link href="/dashboard/bestellungen" className="metric-card">
              <div className="flex items-center justify-between">
                <span className="badge-shell">Umsatz</span>
                <ChartBarIcon className="size-5 text-pirrot-blue-200/80" />
              </div>
              <p className="mt-5 text-3xl font-black text-white sm:text-4xl">
                {formatCents(shopOverview.monthRevenueCents)}
              </p>
              <p className="mt-2 text-sm text-pirrot-blue-100/70">
                {shopOverview.monthOrders} Bestellungen diesen Monat
              </p>
            </Link>

            <Link href="/dashboard/fulfillment" className="metric-card">
              <div className="flex items-center justify-between">
                <span className="badge-shell">Fulfillment</span>
                <TruckIcon className="size-5 text-pirrot-blue-200/80" />
              </div>
              <p className="mt-5 text-3xl font-black text-white sm:text-4xl">
                {fulfillmentQueue}
              </p>
              <p className="mt-2 text-sm text-pirrot-blue-100/70">
                Partner-Bestellungen warten auf Prüfung
              </p>
            </Link>

            <Link href="/dashboard/kunden" className="metric-card">
              <div className="flex items-center justify-between">
                <span className="badge-shell">Kunden</span>
                <UsersIcon className="size-5 text-pirrot-blue-200/80" />
              </div>
              <p className="mt-5 text-3xl font-black text-white sm:text-4xl">
                {customerOverview.totalUsers}
              </p>
              <p className="mt-2 text-sm text-pirrot-blue-100/70">
                {customerOverview.verifiedLast30Days} aktiv in 30 Tagen
              </p>
            </Link>
          </section>

          <section className="dashboard-metric-grid grid gap-4">
            <div className="metric-card">
              <div className="flex items-center justify-between">
                <span className="badge-shell">Module</span>
                <RectangleGroupIcon className="size-5 text-pirrot-blue-200/80" />
              </div>
              <p className="mt-5 text-3xl font-black text-white sm:text-4xl">
                {summary.totalModules}
              </p>
              <p className="mt-2 text-sm text-pirrot-blue-100/70">
                {totalVisibleModules} sichtbar,{" "}
                {visibilityBreakdown.find(
                  (entry) => entry.visibility === "PRIVATE",
                )?.count ?? 0}{" "}
                privat
              </p>
            </div>

            <div className="metric-card">
              <div className="flex items-center justify-between">
                <span className="badge-shell">Typen</span>
                <TagIcon className="size-5 text-pirrot-blue-200/80" />
              </div>
              <p className="mt-5 text-3xl font-black text-white sm:text-4xl">
                {summary.totalTypes}
              </p>
              <p className="mt-2 text-sm text-pirrot-blue-100/70">
                {topTypes[0]
                  ? `${topTypes[0].name} führt mit ${topTypes[0].count}`
                  : "Noch keine Typ-Nutzung"}
              </p>
            </div>

            <div className="metric-card">
              <div className="flex items-center justify-between">
                <span className="badge-shell">Variablen</span>
                <SparklesIcon className="size-5 text-pirrot-blue-200/80" />
              </div>
              <p className="mt-5 text-3xl font-black text-white sm:text-4xl">
                {summary.totalTags}
              </p>
              <p className="mt-2 text-sm text-pirrot-blue-100/70">
                {summary.releasedTags} live, {summary.betaTags} beta,{" "}
                {summary.unreleasedTags} intern
              </p>
            </div>

            <div className="metric-card">
              <div className="flex items-center justify-between">
                <span className="badge-shell">Tooltips</span>
                <DocumentTextIcon className="size-5 text-pirrot-blue-200/80" />
              </div>
              <p className="mt-5 text-3xl font-black text-white sm:text-4xl">
                {summary.tooltipTotal}
              </p>
              <p className="mt-2 text-sm text-pirrot-blue-100/70">
                Wissensbausteine für das Config Panel
              </p>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
            <div className="glass-card-soft p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="compact-label text-xs font-semibold uppercase text-pirrot-blue-200/70">
                    Asset health
                  </p>
                  <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">
                    Was gerade Aufmerksamkeit braucht
                  </h3>
                </div>
                <DocumentMagnifyingGlassIcon className="size-8 shrink-0 text-pirrot-blue-200/70" />
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="field-shell p-4">
                  <p className="text-sm text-pirrot-blue-100/70">
                    Module ohne Hauptdatei
                  </p>
                  <p className="mt-2 text-2xl font-black text-white sm:text-3xl">
                    {summary.missingFileCount}
                  </p>
                  <p className="mt-2 text-sm text-pirrot-blue-100/60">
                    Upload-Lücken im Kernbestand
                  </p>
                </div>
                <div className="field-shell p-4">
                  <p className="text-sm text-pirrot-blue-100/70">
                    Module ohne Vorschau
                  </p>
                  <p className="mt-2 text-2xl font-black text-white sm:text-3xl">
                    {summary.missingPreviewCount}
                  </p>
                  <p className="mt-2 text-sm text-pirrot-blue-100/60">
                    Reduziert die Qualität im Katalog
                  </p>
                </div>
                <div className="field-shell p-4">
                  <p className="text-sm text-pirrot-blue-100/70">
                    Module ohne Tags
                  </p>
                  <p className="mt-2 text-2xl font-black text-white sm:text-3xl">
                    {summary.untaggedCount}
                  </p>
                  <p className="mt-2 text-sm text-pirrot-blue-100/60">
                    Noch keine Formularzuordnung vorhanden
                  </p>
                </div>
                <div className="field-shell p-4">
                  <p className="text-sm text-pirrot-blue-100/70">
                    Module ohne Thema
                  </p>
                  <p className="mt-2 text-2xl font-black text-white sm:text-3xl">
                    {summary.withoutThemeCount}
                  </p>
                  <p className="mt-2 text-sm text-pirrot-blue-100/60">
                    Schwache Such- und Strukturmetadaten
                  </p>
                </div>
              </div>
            </div>

            <div className="glass-card-soft p-5 sm:p-6">
              <p className="compact-label text-xs font-semibold uppercase text-pirrot-blue-200/70">
                Sichtbarkeit
              </p>
              <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">
                Freigabe im Katalog
              </h3>
              <div className="mt-6 space-y-4">
                {visibilityBreakdown.map((entry) => (
                  <div key={entry.visibility}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-pirrot-blue-100/75">
                        {entry.visibility}
                      </span>
                      <span className="font-semibold text-white">
                        {entry.count} ·{" "}
                        {percent(entry.count, summary.totalModules)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-pirrot-blue-950/70">
                      <div
                        className="h-2 rounded-full bg-pirrot-blue-400"
                        style={{
                          width: percent(entry.count, summary.totalModules),
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 border-t border-pirrot-blue-200/10 pt-6">
                <p className="compact-label text-xs font-semibold uppercase text-pirrot-blue-200/70">
                  Modularten
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {partBreakdown.map((entry) => (
                    <span
                      key={entry.part}
                      className="field-shell px-3 py-2 text-sm text-pirrot-blue-100/80"
                    >
                      {partLabels[entry.part]}:{" "}
                      <b className="text-white">{entry.count}</b>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
            <div className="glass-card-soft p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="compact-label text-xs font-semibold uppercase text-pirrot-blue-200/70">
                    Letzte Updates
                  </p>
                  <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">
                    Zuletzt geänderte Module
                  </h3>
                </div>
                <ArrowTrendingUpIcon className="size-7 shrink-0 text-pirrot-blue-200/70" />
              </div>

              <div className="mt-6 space-y-3">
                {recentModules.length === 0 ? (
                  <div className="field-shell p-5 text-sm text-pirrot-blue-100/70">
                    Noch keine Module im Katalog vorhanden.
                  </div>
                ) : (
                  recentModules.map((moduleItem) => (
                    <Link
                      key={moduleItem.id}
                      href={`/dashboard/module/manage?moduleId=${moduleItem.id}`}
                      className="field-shell flex flex-col gap-3 p-4 transition hover:border-pirrot-blue-300/25 hover:bg-pirrot-blue-900/70 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="line-clamp-2 text-lg font-bold leading-tight text-white">
                            {moduleItem.name}
                          </h4>
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${visibilityTone[moduleItem.visible]}`}
                          >
                            {moduleItem.visible}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-pirrot-blue-100/70">
                          {moduleItem.typeName}
                          {moduleItem.theme ? ` · ${moduleItem.theme}` : ""}
                          {` · ${partLabels[moduleItem.part]}`}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.08em] text-pirrot-blue-200/75">
                        <span className="field-shell px-3 py-2">
                          Tags {moduleItem.tagCount}
                        </span>
                        <span className="field-shell px-3 py-2">
                          PDF {moduleItem.hasPdf ? "ok" : "fehlt"}
                        </span>
                        <span className="field-shell px-3 py-2">
                          Preview {moduleItem.hasThumbnail ? "ok" : "fehlt"}
                        </span>
                        <span className="field-shell px-3 py-2">
                          {formatDate(moduleItem.updatedAt)}
                        </span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div className="glass-card-soft p-5 sm:p-6">
                <p className="compact-label text-xs font-semibold uppercase text-pirrot-blue-200/70">
                  Top Typen
                </p>
                <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">
                  Katalogschwerpunkte
                </h3>
                <div className="mt-5 space-y-3">
                  {topTypes.length === 0 ? (
                    <div className="field-shell p-4 text-sm text-pirrot-blue-100/70">
                      Noch keine aktiven Typen im Modulbestand.
                    </div>
                  ) : (
                    topTypes.map((entry, index) => (
                      <div
                        key={entry.id}
                        className="field-shell flex items-center justify-between gap-3 p-4"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-pirrot-blue-500/15 text-sm font-black text-pirrot-blue-100">
                            0{index + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-white">
                              {entry.name}
                            </p>
                            <p className="text-sm text-pirrot-blue-100/65">
                              Aktiv im Modulbestand
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 text-xl font-black text-white">
                          {entry.count}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="glass-card-soft p-5 sm:p-6">
                <p className="compact-label text-xs font-semibold uppercase text-pirrot-blue-200/70">
                  Schnellzugriff
                </p>
                <div className="mt-5 grid gap-3">
                  <Link
                    href="/dashboard/bestellungen"
                    className="btn-secondary justify-between"
                  >
                    Bestellungen abwickeln
                    <ShoppingCartIcon className="size-4" />
                  </Link>
                  <Link
                    href="/dashboard/fulfillment"
                    className="btn-secondary justify-between"
                  >
                    Fulfillment steuern
                    <TruckIcon className="size-4" />
                  </Link>
                  <Link
                    href="/dashboard/kunden"
                    className="btn-secondary justify-between"
                  >
                    Kunden verwalten
                    <UsersIcon className="size-4" />
                  </Link>
                  <Link
                    href="/dashboard/module"
                    className="btn-secondary justify-between"
                  >
                    Module prüfen
                    <DocumentTextIcon className="size-4" />
                  </Link>
                  <Link
                    href="/dashboard/types"
                    className="btn-secondary justify-between"
                  >
                    Typen verwalten
                    <TagIcon className="size-4" />
                  </Link>
                  <Link
                    href="/dashboard/variablen"
                    className="btn-secondary justify-between"
                  >
                    Variablen pflegen
                    <SparklesIcon className="size-4" />
                  </Link>
                  <Link
                    href="/dashboard/tips"
                    className="btn-secondary justify-between"
                  >
                    Tooltips anpassen
                    <EyeSlashIcon className="size-4" />
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </DashboardShell>
    </HydrateClient>
  );
}
