"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import LoadingSpinner from "@/app/_components/loading-spinner";
import { api } from "@/trpc/react";
import { DashboardSkeleton } from "./dashboard-states";

function getPartnerOrderStatusLabel(
  status:
    | "SUBMITTED_BY_SCHOOL"
    | "UNDER_PARTNER_REVIEW"
    | "PARTNER_CONFIRMED"
    | "PARTNER_DECLINED"
    | "RELEASED_TO_PRODUCTION"
    | "FULFILLED",
): string {
  switch (status) {
    case "SUBMITTED_BY_SCHOOL":
      return "Eingereicht";
    case "UNDER_PARTNER_REVIEW":
      return "In Prüfung";
    case "PARTNER_CONFIRMED":
      return "Bestätigt";
    case "PARTNER_DECLINED":
      return "Abgelehnt";
    case "RELEASED_TO_PRODUCTION":
      return "An Produktion gesendet";
    case "FULFILLED":
      return "Erfüllt";
    default:
      return status;
  }
}

function friendlyErrorMessage(
  rawMessage: string | undefined,
  fallback: string,
): string {
  if (!rawMessage) {
    return fallback;
  }
  if (
    rawMessage.includes("Invalid `") ||
    rawMessage.includes("Cannot read properties of undefined") ||
    rawMessage.includes("Unknown argument `")
  ) {
    return fallback;
  }
  return rawMessage;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export default function PartnerSection() {
  const [expandedPartnerOrderId, setExpandedPartnerOrderId] = useState<
    string | null
  >(null);
  const [pendingPartnerOrderId, setPendingPartnerOrderId] = useState<
    string | null
  >(null);
  const [declineReasons, setDeclineReasons] = useState<Record<string, string>>(
    {},
  );

  const utils = api.useUtils();
  const partnerStatus = api.partner.getStatus.useQuery();
  const canManagePartnerOrders =
    partnerStatus.data?.role === "PARTNER" ||
    partnerStatus.data?.role === "SPONSOR" ||
    partnerStatus.data?.role === "ADMIN" ||
    partnerStatus.data?.role === "STAFF";

  const unreadPartnerNotifications =
    api.partner.getUnreadPartnerNotificationCount.useQuery(undefined, {
      enabled: canManagePartnerOrders,
    });
  const partnerNotifications = api.partner.listPartnerNotifications.useQuery(
    { limit: 25 },
    { enabled: canManagePartnerOrders },
  );

  const partnerOrders = api.partner.listIncomingPartnerOrders.useQuery(
    {
      statuses: [
        "SUBMITTED_BY_SCHOOL",
        "UNDER_PARTNER_REVIEW",
        "PARTNER_CONFIRMED",
        "PARTNER_DECLINED",
        "RELEASED_TO_PRODUCTION",
        "FULFILLED",
      ],
    },
    {
      enabled: canManagePartnerOrders,
    },
  );

  const selectedPartnerOrder = api.partner.getPartnerOrderById.useQuery(
    {
      partnerOrderId: expandedPartnerOrderId ?? "",
    },
    {
      enabled: canManagePartnerOrders && Boolean(expandedPartnerOrderId),
    },
  );

  const confirmPartnerOrder = api.partner.confirmPartnerOrder.useMutation({
    onMutate: ({ partnerOrderId }) => {
      setPendingPartnerOrderId(partnerOrderId);
    },
    onSuccess: async () => {
      await utils.partner.listIncomingPartnerOrders.invalidate();
      await utils.partner.getUnreadPartnerNotificationCount.invalidate();
      await utils.partner.listPartnerNotifications.invalidate();
    },
    onSettled: () => {
      setPendingPartnerOrderId(null);
    },
  });

  const releasePartnerOrder =
    api.partner.releasePartnerOrderToProduction.useMutation({
      onMutate: ({ partnerOrderId }) => {
        setPendingPartnerOrderId(partnerOrderId);
      },
      onSuccess: async () => {
        await utils.partner.listIncomingPartnerOrders.invalidate();
        await utils.partner.getUnreadPartnerNotificationCount.invalidate();
        await utils.partner.listPartnerNotifications.invalidate();
      },
      onSettled: () => {
        setPendingPartnerOrderId(null);
      },
    });

  const declinePartnerOrder = api.partner.declinePartnerOrder.useMutation({
    onMutate: ({ partnerOrderId }) => {
      setPendingPartnerOrderId(partnerOrderId);
    },
    onSuccess: async (_data, variables) => {
      setDeclineReasons((prev) => ({
        ...prev,
        [variables.partnerOrderId]: "",
      }));
      await utils.partner.listIncomingPartnerOrders.invalidate();
      await utils.partner.getUnreadPartnerNotificationCount.invalidate();
      await utils.partner.listPartnerNotifications.invalidate();
    },
    onSettled: () => {
      setPendingPartnerOrderId(null);
    },
  });
  const markPartnerNotificationRead =
    api.partner.markPartnerNotificationRead.useMutation({
      onSuccess: async () => {
        await utils.partner.getUnreadPartnerNotificationCount.invalidate();
        await utils.partner.listPartnerNotifications.invalidate();
      },
    });

  const allOrders = useMemo(
    () => partnerOrders.data ?? [],
    [partnerOrders.data],
  );

  const incomingOrders = useMemo(
    () =>
      allOrders.filter((order) => {
        const isSchoolCanceled = order.orderStatus === "CANCELED";
        const isArchivedByStatus =
          order.status === "PARTNER_DECLINED" ||
          order.status === "RELEASED_TO_PRODUCTION" ||
          order.status === "FULFILLED";
        return !isSchoolCanceled && !isArchivedByStatus;
      }),
    [allOrders],
  );

  const archivedOrders = useMemo(
    () =>
      allOrders.filter((order) => {
        const isSchoolCanceled = order.orderStatus === "CANCELED";
        const isArchivedByStatus =
          order.status === "PARTNER_DECLINED" ||
          order.status === "RELEASED_TO_PRODUCTION" ||
          order.status === "FULFILLED";
        return isSchoolCanceled || isArchivedByStatus;
      }),
    [allOrders],
  );

  if (partnerStatus.isLoading) {
    return (
      <div className="relative flex flex-1 flex-col gap-4 lg:min-h-96">
        <DashboardSkeleton rows={3} />
      </div>
    );
  }

  if (!canManagePartnerOrders) {
    return (
      <div className="content-card p-4">
        <h3 className="text-xl font-bold">Partner</h3>
        <p className="text-info-700 mt-2 text-sm">
          Dieser Bereich ist nur für Partner-, Admin- oder Staff-Konten
          sichtbar.
        </p>
      </div>
    );
  }

  const renderOrderCard = (order: (typeof allOrders)[number]) => {
    const isSchoolCanceled = order.orderStatus === "CANCELED";
    const isPartnerDeclined = order.status === "PARTNER_DECLINED";
    const isArchived =
      isSchoolCanceled ||
      isPartnerDeclined ||
      order.status === "RELEASED_TO_PRODUCTION" ||
      order.status === "FULFILLED";

    return (
      <li key={order.id} className="field-shell flex flex-col gap-2 p-3">
        {isSchoolCanceled || isPartnerDeclined ? (
          <div className="border-pirrot-red-400 bg-pirrot-red-50 text-pirrot-red-700 rounded border px-2 py-1 text-xs font-semibold">
            {isSchoolCanceled
              ? "Storniert: Die Bestellung wurde von der Schule storniert (abgeschlossen)."
              : "Abgelehnt: Diese Partner-Bestellung wurde abgelehnt."}
          </div>
        ) : null}
        <p className="font-semibold">
          {order.book?.name ?? "Partner-Bestellung"}
        </p>
        <p className="text-info-700 text-xs">
          Status: {getPartnerOrderStatusLabel(order.status)}
        </p>
        <p className="text-info-700 text-xs">
          Eingereicht: {new Date(order.submittedAt).toLocaleString("de-DE")}
        </p>
        <p className="text-info-700 text-xs">
          Schule: {order.schoolUser?.email ?? "Gastbestellung"}
        </p>
        <button
          type="button"
          onClick={() =>
            setExpandedPartnerOrderId((current) =>
              current === order.id ? null : order.id,
            )
          }
          className="btn-soft w-fit px-3 py-1 text-xs"
        >
          {expandedPartnerOrderId === order.id
            ? "Details ausblenden"
            : "Details anzeigen"}
        </button>

        {expandedPartnerOrderId === order.id ? (
          <div className="rounded bg-white/60 p-2 text-xs">
            {selectedPartnerOrder.isLoading ? (
              <LoadingSpinner />
            ) : selectedPartnerOrder.error ? (
              <p className="text-pirrot-red-500">
                {friendlyErrorMessage(
                  selectedPartnerOrder.error.message,
                  "Details konnten nicht geladen werden.",
                )}
              </p>
            ) : selectedPartnerOrder.data ? (
              (() => {
                const lineItems = asRecord(
                  selectedPartnerOrder.data.lineItemsSnapshot,
                );
                const quantity =
                  typeof lineItems?.quantity === "number"
                    ? lineItems.quantity
                    : null;
                const addOnModules =
                  typeof lineItems?.addOnModules === "string"
                    ? lineItems.addOnModules
                    : null;

                return (
                  <div className="space-y-1">
                    <p>
                      Menge: <b>{quantity ?? "-"}</b>
                    </p>
                    <p>
                      Zusatzmodule:{" "}
                      <b>
                        {addOnModules && addOnModules.length > 0
                          ? addOnModules
                          : "-"}
                      </b>
                    </p>
                    <p>
                      Buch-ID: <b>{selectedPartnerOrder.data.book.id}</b>
                    </p>
                    <Link
                      href={`/dashboard/partner-preview?partnerOrderId=${encodeURIComponent(order.id)}`}
                      className="btn-soft mt-2 inline-flex w-fit px-3 py-1.5 text-xs"
                    >
                      Planer-Vorschau (Read-Only) öffnen
                    </Link>
                  </div>
                );
              })()
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              confirmPartnerOrder.mutate({ partnerOrderId: order.id })
            }
            disabled={
              isSchoolCanceled ||
              (order.status !== "SUBMITTED_BY_SCHOOL" &&
                order.status !== "UNDER_PARTNER_REVIEW")
                ? true
                : pendingPartnerOrderId === order.id
            }
            className="btn-solid px-3 py-2 disabled:opacity-60"
          >
            Partnerschaft bestätigen
          </button>
          <button
            type="button"
            onClick={() =>
              releasePartnerOrder.mutate({ partnerOrderId: order.id })
            }
            disabled={
              isSchoolCanceled ||
              order.status !== "PARTNER_CONFIRMED" ||
              pendingPartnerOrderId === order.id
            }
            className="btn-soft px-3 py-2 disabled:opacity-60"
          >
            An Produktion senden
          </button>
        </div>

        {!isSchoolCanceled && !isArchived ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={declineReasons[order.id] ?? ""}
              onChange={(event) =>
                setDeclineReasons((prev) => ({
                  ...prev,
                  [order.id]: event.target.value,
                }))
              }
              placeholder="Ablehnungsgrund (mind. 3 Zeichen)"
              className="field-shell min-w-64 flex-1 px-3 py-2"
            />
            <button
              type="button"
              onClick={() =>
                declinePartnerOrder.mutate({
                  partnerOrderId: order.id,
                  reason: (declineReasons[order.id] ?? "").trim(),
                })
              }
              disabled={
                order.status !== "SUBMITTED_BY_SCHOOL" &&
                order.status !== "UNDER_PARTNER_REVIEW"
                  ? true
                  : pendingPartnerOrderId === order.id ||
                    (declineReasons[order.id] ?? "").trim().length < 3
              }
              className="btn-soft px-3 py-2 disabled:opacity-60"
            >
              Ablehnen
            </button>
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="content-card p-4">
        <h2 className="text-2xl font-bold uppercase">Partner</h2>
        <p className="text-info-700 mt-2 text-sm">
          Verwalten Sie eingehende Partner-Bestellungen und abgeschlossene
          Vorgänge getrennt.
        </p>
        <p className="text-info-700 mt-1 text-sm">
          Ungelesene Hinweise:{" "}
          <b>{unreadPartnerNotifications.data?.count ?? 0}</b>
        </p>
      </div>

      <div className="content-card flex flex-col gap-3 p-4">
        <h3 className="text-xl font-bold">Hinweise</h3>
        {partnerNotifications.isLoading ? (
          <LoadingSpinner />
        ) : (partnerNotifications.data?.length ?? 0) > 0 ? (
          <ul className="flex flex-col gap-2 text-sm">
            {partnerNotifications.data?.map((notification) => {
              const isUnread = notification.readAt === null;
              const orderId = notification.partnerOrder?.id ?? null;
              return (
                <li
                  key={notification.id}
                  className={`field-shell flex flex-col gap-2 p-3 ${
                    isUnread
                      ? "border-pirrot-blue-300 bg-pirrot-blue-50/40"
                      : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {notification.type === "INCOMING_PARTNER_ORDER"
                        ? "Neue Partner-Bestellung eingegangen"
                        : notification.type === "PARTNER_ORDER_CONFIRMED"
                          ? "Partner-Bestellung bestätigt"
                          : notification.type === "PARTNER_ORDER_DECLINED"
                            ? "Partner-Bestellung abgelehnt"
                            : notification.type === "PARTNER_ORDER_RELEASED"
                              ? "An Produktion gesendet"
                              : "Partner-Hinweis"}
                    </p>
                    <span className="text-info-700 text-xs">
                      {new Date(notification.createdAt).toLocaleString("de-DE")}
                    </span>
                  </div>
                  {orderId ? (
                    <p className="text-info-700 text-xs">
                      Bestell-ID: <b>{orderId}</b>
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {orderId ? (
                      <button
                        type="button"
                        className="btn-soft px-3 py-1.5 text-xs"
                        onClick={() => setExpandedPartnerOrderId(orderId)}
                      >
                        Bestellung öffnen
                      </button>
                    ) : null}
                    {isUnread ? (
                      <button
                        type="button"
                        className="btn-soft px-3 py-1.5 text-xs"
                        onClick={() =>
                          markPartnerNotificationRead.mutate({
                            notificationId: notification.id,
                          })
                        }
                        disabled={markPartnerNotificationRead.isPending}
                      >
                        Als gelesen markieren
                      </button>
                    ) : (
                      <span className="text-info-700 text-xs">
                        Bereits gelesen
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-info-700 text-sm">Keine Hinweise vorhanden.</p>
        )}
      </div>

      <div className="content-card flex flex-col gap-3 p-4">
        <h3 className="text-xl font-bold">Eingang ({incomingOrders.length})</h3>
        {partnerOrders.isLoading ? (
          <LoadingSpinner />
        ) : incomingOrders.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm">
            {incomingOrders.map(renderOrderCard)}
          </ul>
        ) : (
          <p className="text-info-700 text-sm">
            Keine offenen Partner-Bestellungen vorhanden.
          </p>
        )}
      </div>

      <div className="content-card flex flex-col gap-3 p-4">
        <h3 className="text-xl font-bold">Archiv ({archivedOrders.length})</h3>
        {partnerOrders.isLoading ? (
          <LoadingSpinner />
        ) : archivedOrders.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm">
            {archivedOrders.map(renderOrderCard)}
          </ul>
        ) : (
          <p className="text-info-700 text-sm">
            Noch keine abgeschlossenen Partner-Bestellungen.
          </p>
        )}
      </div>

      {partnerOrders.error ? (
        <p className="text-pirrot-red-500 text-sm">
          {friendlyErrorMessage(
            partnerOrders.error.message,
            "Partner-Bestellungen konnten nicht geladen werden.",
          )}
        </p>
      ) : null}
      {confirmPartnerOrder.error ? (
        <p className="text-pirrot-red-500 text-sm">
          {friendlyErrorMessage(
            confirmPartnerOrder.error.message,
            "Bestätigung konnte nicht durchgeführt werden.",
          )}
        </p>
      ) : null}
      {declinePartnerOrder.error ? (
        <p className="text-pirrot-red-500 text-sm">
          {friendlyErrorMessage(
            declinePartnerOrder.error.message,
            "Ablehnung konnte nicht durchgeführt werden.",
          )}
        </p>
      ) : null}
      {releasePartnerOrder.error ? (
        <p className="text-pirrot-red-500 text-sm">
          {friendlyErrorMessage(
            releasePartnerOrder.error.message,
            "Freigabe an Produktion fehlgeschlagen.",
          )}
        </p>
      ) : null}
      {markPartnerNotificationRead.error ? (
        <p className="text-pirrot-red-500 text-sm">
          {friendlyErrorMessage(
            markPartnerNotificationRead.error.message,
            "Hinweis konnte nicht als gelesen markiert werden.",
          )}
        </p>
      ) : null}
    </div>
  );
}
