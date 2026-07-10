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
import { USER_ROLE_META } from "@/util/status-labels";

const ROLE_FILTERS = [
  "",
  "ADMIN",
  "STAFF",
  "MODERATOR",
  "PARTNER",
  "SPONSOR",
  "USER",
] as const;

type RoleFilter =
  | "ADMIN"
  | "STAFF"
  | "MODERATOR"
  | "USER"
  | "SPONSOR"
  | "PARTNER"
  | undefined;

export default function CustomersTable() {
  const router = useRouter();
  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState<string | undefined>(undefined);
  const [role, setRole] = useState<RoleFilter>(undefined);
  const [page, setPage] = useState(1);

  const overview = api.customer.getOverview.useQuery();
  const customers = api.customer.getAll.useQuery(
    { query, role, page, pageSize: 20 },
    { placeholderData: keepPreviousData },
  );

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchDraft.trim() === "" ? undefined : searchDraft.trim());
    setPage(1);
  }

  const items = customers.data?.items ?? [];
  const pageCount = customers.data?.pageCount ?? 1;
  const roleCounts = overview.data?.roleCounts ?? {};

  return (
    <div className="flex flex-col gap-6">
      <section className="dashboard-metric-grid grid gap-4">
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Nutzer gesamt
          </p>
          <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {overview.data?.totalUsers ?? "–"}
          </p>
          <p className="mt-2 text-sm text-pirrot-blue-100/70">
            {overview.data
              ? `${overview.data.verifiedLast30Days} aktiv in 30 Tagen`
              : ""}
          </p>
        </div>
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Partner
          </p>
          <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {(roleCounts.PARTNER ?? 0) + (roleCounts.SPONSOR ?? 0)}
          </p>
          <p className="mt-2 text-sm text-pirrot-blue-100/70">
            inkl. Sponsoren
          </p>
        </div>
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Staff-Team
          </p>
          <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {(roleCounts.ADMIN ?? 0) +
              (roleCounts.STAFF ?? 0) +
              (roleCounts.MODERATOR ?? 0)}
          </p>
          <p className="mt-2 text-sm text-pirrot-blue-100/70">
            Admin, Staff, Moderator
          </p>
        </div>
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Standard-Nutzer
          </p>
          <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {roleCounts.USER ?? 0}
          </p>
          <p className="mt-2 text-sm text-pirrot-blue-100/70">Rolle USER</p>
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
              placeholder="Suche nach E-Mail, Name oder ID …"
              className="soft-input soft-input-leading"
            />
          </form>
          <div className="flex flex-wrap items-center gap-2">
            {ROLE_FILTERS.map((filter) => {
              const isActive = (role ?? "") === filter;
              return (
                <button
                  key={filter === "" ? "ALL" : filter}
                  type="button"
                  onClick={() => {
                    setRole(filter === "" ? undefined : filter);
                    setPage(1);
                  }}
                  className={
                    isActive
                      ? "btn-primary px-3 py-1.5 text-sm"
                      : "btn-secondary px-3 py-1.5 text-sm"
                  }
                >
                  {filter === ""
                    ? "Alle Rollen"
                    : (USER_ROLE_META[filter]?.label ?? filter)}
                </button>
              );
            })}
          </div>
        </div>

        {customers.isPending ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-pirrot-blue-100/70">
            Keine Nutzer gefunden.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-pirrot-blue-200/10 text-xs uppercase tracking-wide text-pirrot-blue-200/70">
                  <th className="px-3 py-3 font-semibold">E-Mail</th>
                  <th className="px-3 py-3 font-semibold">Name</th>
                  <th className="px-3 py-3 font-semibold">Rolle</th>
                  <th className="px-3 py-3 font-semibold">Planer</th>
                  <th className="px-3 py-3 font-semibold">Bestellungen</th>
                  <th className="px-3 py-3 font-semibold">Module</th>
                  <th className="px-3 py-3 font-semibold">Kampagnen</th>
                </tr>
              </thead>
              <tbody>
                {items.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() =>
                      router.push(`/dashboard/kunden/manage?userId=${user.id}`)
                    }
                    className="cursor-pointer border-b border-pirrot-blue-200/5 text-pirrot-blue-50 transition hover:bg-pirrot-blue-950/60"
                  >
                    <td className="max-w-64 truncate px-3 py-3 font-semibold text-white">
                      {user.email ?? "–"}
                    </td>
                    <td className="max-w-44 truncate px-3 py-3">
                      {user.name ?? "–"}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={user.role} map={USER_ROLE_META} />
                    </td>
                    <td className="px-3 py-3">{user._count.books}</td>
                    <td className="px-3 py-3">{user._count.orders}</td>
                    <td className="px-3 py-3">{user._count.modules}</td>
                    <td className="px-3 py-3">{user.campaignCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-pirrot-blue-200/10 pt-4">
          <p className="text-sm text-pirrot-blue-100/70">
            Seite {page} von {pageCount}
            {customers.data ? ` · ${customers.data.total} Nutzer` : ""}
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
