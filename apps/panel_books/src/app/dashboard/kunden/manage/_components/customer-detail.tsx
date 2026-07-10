"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/trpc/react";
import LoadingSpinner from "@/app/_components/loading-spinner";
import StatusBadge from "@/app/_components/status-badge";
import { formatCents, formatDate } from "@/util/format";
import {
  ORDER_STATUS_META,
  PAYMENT_STATUS_META,
  USER_ROLE_META,
} from "@/util/status-labels";

const ROLE_OPTIONS = [
  "USER",
  "PARTNER",
  "SPONSOR",
  "MODERATOR",
  "STAFF",
  "ADMIN",
] as const;

type CustomerDetailProps = {
  userId: string;
};

export default function CustomerDetail({ userId }: CustomerDetailProps) {
  const utils = api.useUtils();
  const customer = api.customer.getById.useQuery({ userId });

  const [roleDraft, setRoleDraft] =
    useState<(typeof ROLE_OPTIONS)[number]>("USER");
  const [feedback, setFeedback] = useState<string | undefined>();

  useEffect(() => {
    if (customer.data) {
      setRoleDraft(customer.data.role);
    }
  }, [customer.data]);

  const setRole = api.customer.setRole.useMutation({
    onSuccess: async () => {
      setFeedback("Rolle aktualisiert.");
      await utils.customer.invalidate();
    },
    onError: (error) => setFeedback(error.message),
  });

  if (customer.isPending) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (customer.isError || !customer.data) {
    return (
      <p className="py-16 text-center text-sm text-pirrot-blue-100/70">
        {customer.error?.message ?? "Nutzer konnte nicht geladen werden."}
      </p>
    );
  }

  const data = customer.data;

  return (
    <div className="flex flex-col gap-6">
      {feedback ? (
        <div className="glass-card-soft flex items-center justify-between gap-4 border-pirrot-blue-300/25 p-4 text-sm text-pirrot-blue-50">
          <span>{feedback}</span>
          <button
            type="button"
            className="btn-secondary px-3 py-1 text-xs"
            onClick={() => setFeedback(undefined)}
          >
            OK
          </button>
        </div>
      ) : null}

      <section className="glass-card-soft flex flex-col gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="badge-shell w-fit">Konto</p>
            <h3 className="mt-3 text-2xl font-black text-white">
              {data.name ?? data.email ?? data.id}
            </h3>
            <p className="mt-1 text-sm text-pirrot-blue-100/70">
              {data.email}
              {data.emailVerified
                ? ` · verifiziert am ${formatDate(data.emailVerified)}`
                : " · nicht verifiziert"}
            </p>
            <p className="mt-1 text-xs text-pirrot-blue-100/50">
              ID: {data.id}
              {data.accounts.length > 0
                ? ` · Login: ${data.accounts
                    .map((account) => account.provider)
                    .join(", ")}`
                : ""}
            </p>
          </div>
          <StatusBadge status={data.role} map={USER_ROLE_META} />
        </div>

        <div className="flex flex-col gap-3 border-t border-pirrot-blue-200/10 pt-4 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-2 text-sm text-pirrot-blue-100/80">
            Rolle
            <select
              value={roleDraft}
              onChange={(event) =>
                setRoleDraft(
                  event.target.value as (typeof ROLE_OPTIONS)[number],
                )
              }
              className="soft-input"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {USER_ROLE_META[option]?.label ?? option}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={setRole.isPending || roleDraft === data.role}
            onClick={() => setRole.mutate({ userId: data.id, role: roleDraft })}
          >
            {setRole.isPending ? "Speichert …" : "Rolle speichern"}
          </button>
        </div>
        <p className="text-xs text-pirrot-blue-100/55">
          Die Rolle ADMIN kann nur von Admins vergeben oder geändert werden.
        </p>
      </section>

      <section className="dashboard-metric-grid grid gap-4">
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Planer
          </p>
          <p className="mt-4 text-3xl font-black text-white">
            {data._count.books}
          </p>
        </div>
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Bestellungen
          </p>
          <p className="mt-4 text-3xl font-black text-white">
            {data._count.orders}
          </p>
        </div>
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Module
          </p>
          <p className="mt-4 text-3xl font-black text-white">
            {data._count.modules}
          </p>
        </div>
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Kampagnen
          </p>
          <p className="mt-4 text-3xl font-black text-white">
            {data.campaignCount}
          </p>
          <p className="mt-2 text-sm text-pirrot-blue-100/70">
            {data._count.partnerOrdersAsPartner} Partner-Bestellungen
          </p>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="glass-card-soft flex flex-col gap-4 p-5">
          <h4 className="text-lg font-bold text-white">Letzte Bestellungen</h4>
          {data.orders.length === 0 ? (
            <p className="text-sm text-pirrot-blue-100/70">
              Keine Bestellungen vorhanden.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.orders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/dashboard/bestellungen/manage?orderId=${order.id}`}
                    className="field-shell flex flex-wrap items-center justify-between gap-3 p-3 transition hover:border-pirrot-blue-300/30"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">
                        {order.orderKey ?? `#${order.id}`}
                      </p>
                      <p className="truncate text-xs text-pirrot-blue-100/65">
                        {order.bookOrder?.book.name ?? "Ohne Planer"} ·{" "}
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {order.bookOrder?.payment ? (
                        <>
                          <span className="font-semibold text-white">
                            {formatCents(
                              order.bookOrder.payment.total,
                              order.bookOrder.payment.currency,
                            )}
                          </span>
                          <StatusBadge
                            status={order.bookOrder.payment.status}
                            map={PAYMENT_STATUS_META}
                          />
                        </>
                      ) : null}
                      <StatusBadge
                        status={order.status}
                        map={ORDER_STATUS_META}
                      />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="glass-card-soft flex flex-col gap-4 p-5">
          <h4 className="text-lg font-bold text-white">Letzte Planer</h4>
          {data.books.length === 0 ? (
            <p className="text-sm text-pirrot-blue-100/70">
              Keine Planer vorhanden.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.books.map((book) => (
                <li
                  key={book.id}
                  className="field-shell flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">
                      {book.name ?? "Ohne Namen"}
                    </p>
                    <p className="text-xs text-pirrot-blue-100/65">
                      Aktualisiert {formatDate(book.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase">
                    {book.isTemplate ? (
                      <span className="rounded-full border border-pirrot-blue-300/20 bg-pirrot-blue-950/55 px-2 py-0.5 text-pirrot-blue-200">
                        Vorlage
                      </span>
                    ) : null}
                    {book.isFeatured ? (
                      <span className="rounded-full border border-warning-400/25 bg-warning-950/35 px-2 py-0.5 text-warning-200">
                        Featured
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
