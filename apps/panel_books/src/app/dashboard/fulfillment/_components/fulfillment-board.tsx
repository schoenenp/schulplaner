"use client";

import { useState } from "react";
import {
  BanknotesIcon,
  CheckCircleIcon,
  RocketLaunchIcon,
} from "@heroicons/react/16/solid";

import Modal from "@/app/_components/modal";
import { api } from "@/trpc/react";
import LoadingSpinner from "@/app/_components/loading-spinner";
import StatusBadge from "@/app/_components/status-badge";
import { formatCents, formatDateTime } from "@/util/format";
import { PARTNER_ORDER_STATUS_META } from "@/util/status-labels";

const STATUS_FILTERS = [
  { value: "OPEN", label: "Offene" },
  { value: "SUBMITTED_BY_SCHOOL", label: "Eingereicht" },
  { value: "UNDER_PARTNER_REVIEW", label: "In Prüfung" },
  { value: "PARTNER_CONFIRMED", label: "Bestätigt" },
  { value: "RELEASED_TO_PRODUCTION", label: "In Produktion" },
  { value: "FULFILLED", label: "Abgeschlossen" },
  { value: "PARTNER_DECLINED", label: "Abgelehnt" },
  { value: "ALL", label: "Alle" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

type PartnerOrderStatus =
  | "SUBMITTED_BY_SCHOOL"
  | "UNDER_PARTNER_REVIEW"
  | "PARTNER_CONFIRMED"
  | "PARTNER_DECLINED"
  | "RELEASED_TO_PRODUCTION"
  | "FULFILLED";

function statusesForFilter(
  filter: StatusFilter,
): PartnerOrderStatus[] | undefined {
  if (filter === "ALL") return undefined;
  if (filter === "OPEN") {
    return [
      "SUBMITTED_BY_SCHOOL",
      "UNDER_PARTNER_REVIEW",
      "PARTNER_CONFIRMED",
    ];
  }
  return [filter];
}

type AdjustTarget = {
  partnerOrderId: string;
  bookName: string | null;
  grandTotalAmount: number;
};

type ConfirmAction = {
  kind: "confirm" | "release";
  partnerOrderId: string;
  bookName: string | null;
};

export default function FulfillmentBoard() {
  const utils = api.useUtils();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("OPEN");
  const [feedback, setFeedback] = useState<string | undefined>();

  const [adjustTarget, setAdjustTarget] = useState<AdjustTarget | undefined>();
  const [adjustType, setAdjustType] = useState<"FIXED" | "PERCENT_DISCOUNT">(
    "PERCENT_DISCOUNT",
  );
  const [adjustValueDraft, setAdjustValueDraft] = useState("");
  const [adjustReasonDraft, setAdjustReasonDraft] = useState("");
  const [confirmAction, setConfirmAction] = useState<
    ConfirmAction | undefined
  >();

  const orders = api.fulfillment.listPartnerOrders.useQuery({
    statuses: statusesForFilter(statusFilter),
  });

  async function refresh() {
    await utils.fulfillment.invalidate();
  }

  const adjustAmount = api.fulfillment.adjustAmount.useMutation({
    onSuccess: async () => {
      setFeedback("Betrag wurde angepasst.");
      setAdjustTarget(undefined);
      await refresh();
    },
    onError: (error) => setFeedback(error.message),
  });

  const confirmOrder = api.fulfillment.confirmPartnerOrder.useMutation({
    onSuccess: async () => {
      setFeedback("Bestellung bestätigt, Schulrechnung wurde erstellt.");
      setConfirmAction(undefined);
      await refresh();
    },
    onError: (error) => setFeedback(error.message),
  });

  const releaseOrder = api.fulfillment.releasePartnerOrder.useMutation({
    onSuccess: async (result) => {
      setFeedback(
        result.orderKey
          ? `Für Produktion freigegeben (${result.orderKey}).`
          : "Für Produktion freigegeben.",
      );
      setConfirmAction(undefined);
      await refresh();
    },
    onError: (error) => setFeedback(error.message),
  });

  function submitAdjust(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adjustTarget) return;

    const numericValue = Number(adjustValueDraft.replace(",", "."));
    adjustAmount.mutate({
      partnerOrderId: adjustTarget.partnerOrderId,
      reason: adjustReasonDraft,
      adjustment:
        adjustType === "FIXED"
          ? { type: "FIXED", amountCents: Math.round(numericValue * 100) }
          : { type: "PERCENT_DISCOUNT", percent: numericValue },
    });
  }

  const items = orders.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Modal selector="modal-hook" show={adjustTarget !== undefined}>
        <div className="fixed inset-0 z-[69] flex items-center justify-center bg-slate-950/80 p-4">
          <div className="glass-card w-full max-w-lg p-5">
            <h3 className="text-xl font-bold text-white">Betrag anpassen</h3>
            <p className="mt-2 text-sm text-pirrot-blue-100/75">
              {adjustTarget?.bookName ?? "Partner-Bestellung"} · aktuell{" "}
              {adjustTarget ? formatCents(adjustTarget.grandTotalAmount) : ""}
            </p>
            <form onSubmit={submitAdjust} className="mt-5 flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
                  Anpassungsart
                  <select
                    value={adjustType}
                    onChange={(event) =>
                      setAdjustType(
                        event.target.value as "FIXED" | "PERCENT_DISCOUNT",
                      )
                    }
                    className="soft-input"
                  >
                    <option value="PERCENT_DISCOUNT">Rabatt in %</option>
                    <option value="FIXED">Neuer Festbetrag (EUR)</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
                  {adjustType === "FIXED" ? "Betrag (EUR)" : "Rabatt (%)"}
                  <input
                    type="number"
                    min={0}
                    step={adjustType === "FIXED" ? 0.01 : 1}
                    max={adjustType === "FIXED" ? undefined : 100}
                    value={adjustValueDraft}
                    onChange={(event) =>
                      setAdjustValueDraft(event.target.value)
                    }
                    required
                    className="soft-input"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
                Begründung (Pflicht, wird protokolliert)
                <textarea
                  value={adjustReasonDraft}
                  onChange={(event) => setAdjustReasonDraft(event.target.value)}
                  minLength={3}
                  maxLength={500}
                  required
                  rows={3}
                  className="soft-input resize-none"
                />
              </label>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setAdjustTarget(undefined)}
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="btn-primary gap-2"
                  disabled={adjustAmount.isPending}
                >
                  <BanknotesIcon className="size-4" />
                  {adjustAmount.isPending ? "Speichert …" : "Betrag anpassen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Modal>

      <Modal selector="modal-hook" show={confirmAction !== undefined}>
        <div className="fixed inset-0 z-[69] flex items-center justify-center bg-slate-950/80 p-4">
          <div className="glass-card w-full max-w-lg p-5">
            <h3 className="text-xl font-bold text-white">
              {confirmAction?.kind === "confirm"
                ? "Bestellung als Plattform bestätigen?"
                : "Für Produktion freigeben?"}
            </h3>
            <p className="mt-2 text-sm text-pirrot-blue-100/75">
              {confirmAction?.kind === "confirm"
                ? `Bestätigt „${confirmAction?.bookName ?? "die Bestellung"}" und stellt der Schule die Rechnung über Stripe zu.`
                : `Gibt „${confirmAction?.bookName ?? "die Bestellung"}" unwiderruflich in die Produktion.`}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmAction(undefined)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-primary gap-2"
                disabled={confirmOrder.isPending || releaseOrder.isPending}
                onClick={() => {
                  if (!confirmAction) return;
                  if (confirmAction.kind === "confirm") {
                    confirmOrder.mutate({
                      partnerOrderId: confirmAction.partnerOrderId,
                    });
                  } else {
                    releaseOrder.mutate({
                      partnerOrderId: confirmAction.partnerOrderId,
                    });
                  }
                }}
              >
                {confirmAction?.kind === "confirm" ? (
                  <CheckCircleIcon className="size-4" />
                ) : (
                  <RocketLaunchIcon className="size-4" />
                )}
                {confirmOrder.isPending || releaseOrder.isPending
                  ? "Läuft …"
                  : "Bestätigen"}
              </button>
            </div>
          </div>
        </div>
      </Modal>

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

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatusFilter(filter.value)}
            className={
              statusFilter === filter.value
                ? "btn-primary px-3 py-1.5 text-sm"
                : "btn-secondary px-3 py-1.5 text-sm"
            }
          >
            {filter.label}
          </button>
        ))}
      </div>

      {orders.isPending ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-pirrot-blue-100/70">
          Keine Partner-Bestellungen in dieser Ansicht.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((order, index) => {
            const adjustment = order.adminSettlementAdjustment as {
              finalGrandTotalAmount?: number;
              reason?: string;
            } | null;
            const canAdjust =
              order.status === "SUBMITTED_BY_SCHOOL" ||
              order.status === "UNDER_PARTNER_REVIEW";
            const canConfirm = canAdjust;
            const canRelease = order.status === "PARTNER_CONFIRMED";

            return (
              <article
                key={order.id}
                className="glass-card-soft rise-in flex flex-col gap-4 p-5"
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-black text-white">
                      {order.book?.name ?? "Unbenannter Planer"}
                    </h3>
                    <p className="mt-1 text-sm text-pirrot-blue-100/70">
                      Partner: {order.partnerUser?.email ?? "–"}
                      {order.schoolUser?.email
                        ? ` · Schule: ${order.schoolUser.email}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-pirrot-blue-100/55">
                      Eingereicht {formatDateTime(order.submittedAt)}
                      {order.order?.orderKey
                        ? ` · Auftrag ${order.order.orderKey}`
                        : ""}
                    </p>
                  </div>
                  <StatusBadge
                    status={order.status}
                    map={PARTNER_ORDER_STATUS_META}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-4 border-t border-pirrot-blue-200/10 pt-4">
                  <div className="field-shell px-4 py-2.5">
                    <p className="compact-label text-[10px] uppercase text-pirrot-blue-200/65">
                      Gesamtbetrag
                    </p>
                    <p className="text-lg font-black text-white">
                      {formatCents(order.totals.grandTotalAmount)}
                    </p>
                  </div>
                  {adjustment?.finalGrandTotalAmount !== undefined ? (
                    <div className="field-shell border-warning-400/25 px-4 py-2.5">
                      <p className="compact-label text-[10px] uppercase text-warning-200/80">
                        Angepasst
                      </p>
                      <p className="text-lg font-black text-warning-200">
                        {formatCents(adjustment.finalGrandTotalAmount)}
                      </p>
                    </div>
                  ) : null}
                  {order.declineReason ? (
                    <p className="max-w-md text-sm text-pirrot-red-300">
                      Ablehnungsgrund: {order.declineReason}
                    </p>
                  ) : null}

                  <div className="ml-auto flex flex-wrap gap-2">
                    {canAdjust ? (
                      <button
                        type="button"
                        className="btn-secondary gap-2 px-3 py-1.5 text-sm"
                        onClick={() =>
                          setAdjustTarget({
                            partnerOrderId: order.id,
                            bookName: order.book?.name ?? null,
                            grandTotalAmount: order.totals.grandTotalAmount,
                          })
                        }
                      >
                        <BanknotesIcon className="size-4" />
                        Betrag anpassen
                      </button>
                    ) : null}
                    {canConfirm ? (
                      <button
                        type="button"
                        className="btn-primary gap-2 px-3 py-1.5 text-sm"
                        onClick={() =>
                          setConfirmAction({
                            kind: "confirm",
                            partnerOrderId: order.id,
                            bookName: order.book?.name ?? null,
                          })
                        }
                      >
                        <CheckCircleIcon className="size-4" />
                        Bestätigen
                      </button>
                    ) : null}
                    {canRelease ? (
                      <button
                        type="button"
                        className="btn-primary gap-2 px-3 py-1.5 text-sm"
                        onClick={() =>
                          setConfirmAction({
                            kind: "release",
                            partnerOrderId: order.id,
                            bookName: order.book?.name ?? null,
                          })
                        }
                      >
                        <RocketLaunchIcon className="size-4" />
                        Produktion freigeben
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
