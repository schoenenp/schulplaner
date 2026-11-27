"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { api } from "@/trpc/react";
import LoadingSpinner from "@/app/_components/loading-spinner";
import StatusBadge from "@/app/_components/status-badge";
import { formatCents, formatDate, formatDateTime } from "@/util/format";
import { downloadPlannerPrintPdf } from "@/util/planner-pdf-download";
import {
  DELIVERY_STATUS_META,
  ORDER_STATUS_META,
  PARTNER_ORDER_STATUS_META,
  PAYMENT_STATUS_META,
} from "@/util/status-labels";

const ORDER_STATUS_OPTIONS = [
  "PENDING",
  "COMPLETED",
  "SHIPPED",
  "CANCELED",
  "FAILED",
] as const;

const DELIVERY_STATUS_OPTIONS = [
  "PENDING",
  "PREPARING",
  "SHIPPED",
  "COMPLETED",
  "RETOURING",
  "RETOURED",
] as const;

type OrderDetailProps = {
  orderId: number;
};

function SchoolAddress({
  label,
  address,
}: {
  label: string;
  address: unknown;
}) {
  if (!address || typeof address !== "object" || Array.isArray(address))
    return null;
  const fields = address as Record<string, unknown>;
  const locality = [fields.zip, fields.city]
    .filter((part) => typeof part === "string")
    .join(" ");
  const lines = [
    fields.recipient,
    fields.extra,
    fields.street,
    locality,
    fields.country === "AT" ? "Österreich" : "Deutschland",
  ];
  return (
    <div className="field-shell p-3">
      <h5 className="mb-1 font-semibold text-white">{label}</h5>
      {lines.map((line, index) =>
        typeof line === "string" && line ? <p key={index}>{line}</p> : null,
      )}
    </div>
  );
}

export default function OrderDetail({ orderId }: OrderDetailProps) {
  const utils = api.useUtils();
  const order = api.shopOrder.getById.useQuery({ orderId });

  const [statusDraft, setStatusDraft] =
    useState<(typeof ORDER_STATUS_OPTIONS)[number]>("PENDING");
  const [shippingStatusDraft, setShippingStatusDraft] =
    useState<(typeof DELIVERY_STATUS_OPTIONS)[number]>("PENDING");
  const [trackIdDraft, setTrackIdDraft] = useState("");
  const [shippingTitleDraft, setShippingTitleDraft] = useState("");
  const [feedback, setFeedback] = useState<string | undefined>();
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoicePaid, setInvoicePaid] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!order.data) return;
    setStatusDraft(order.data.status);
    setShippingStatusDraft(order.data.shipping?.status ?? "PENDING");
    setTrackIdDraft(order.data.shipping?.trackId ?? "");
    setShippingTitleDraft(order.data.shipping?.title ?? "");
    setInvoiceNumber(order.data.schoolDetails?.invoiceNumber ?? "");
    setInvoicePaid(order.data.bookOrder?.payment.status === "SUCCEEDED");
  }, [order.data]);

  const updateStatus = api.shopOrder.updateStatus.useMutation({
    onSuccess: async () => {
      setFeedback("Bestellstatus aktualisiert.");
      await utils.shopOrder.invalidate();
    },
    onError: (error) => setFeedback(error.message),
  });

  const updateShipping = api.shopOrder.updateShipping.useMutation({
    onSuccess: async () => {
      setFeedback("Versanddaten aktualisiert.");
      await utils.shopOrder.invalidate();
    },
    onError: (error) => setFeedback(error.message),
  });

  const updateSchoolInvoice = api.shopOrder.updateSchoolInvoice.useMutation({
    onSuccess: async () => {
      setFeedback("Rechnungsdaten aktualisiert.");
      await utils.shopOrder.invalidate();
    },
    onError: (error) => setFeedback(error.message),
  });

  async function downloadSchoolPlanner(bookId: string) {
    setPrinting(true);
    setFeedback(undefined);
    try {
      const source = await utils.planner.getPdfSource.fetch({ bookId });
      await downloadPlannerPrintPdf(source);
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "PDF konnte nicht erstellt werden.",
      );
    } finally {
      setPrinting(false);
    }
  }

  if (order.isPending) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (order.isError || !order.data) {
    return (
      <p className="py-16 text-center text-sm text-pirrot-blue-100/70">
        {order.error?.message ?? "Bestellung konnte nicht geladen werden."}
      </p>
    );
  }

  const data = order.data;
  const payment = data.bookOrder?.payment;
  const book = data.bookOrder?.book;
  const school = data.schoolDetails;
  const binding = book?.modules[0]?.module.name;

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

      <section className="glass-card-soft flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="badge-shell w-fit">Auftrag</p>
            <h3 className="mt-3 text-2xl font-black text-white">
              {data.orderKey ?? `#${data.id}`}
            </h3>
            <p className="mt-1 text-sm text-pirrot-blue-100/70">
              Erstellt am {formatDateTime(data.createdAt)}
              {data.canceledAt
                ? ` · Storniert am ${formatDateTime(data.canceledAt)}`
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={data.status} map={ORDER_STATUS_META} />
            {payment ? (
              <StatusBadge status={payment.status} map={PAYMENT_STATUS_META} />
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-pirrot-blue-200/10 pt-4 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-2 text-sm text-pirrot-blue-100/80">
            Bestellstatus
            <select
              value={statusDraft}
              onChange={(event) =>
                setStatusDraft(
                  event.target.value as (typeof ORDER_STATUS_OPTIONS)[number],
                )
              }
              className="soft-input"
            >
              {ORDER_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {ORDER_STATUS_META[option]?.label ?? option}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-primary"
            disabled={updateStatus.isPending || statusDraft === data.status}
            onClick={() =>
              updateStatus.mutate({ orderId: data.id, status: statusDraft })
            }
          >
            {updateStatus.isPending ? "Speichert …" : "Status speichern"}
          </button>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="glass-card-soft flex flex-col gap-4 p-5">
          <h4 className="text-lg font-bold text-white">
            {school ? "Schule und Adressen" : "Kunde"}
          </h4>
          {school ? (
            <div className="flex flex-col gap-3 text-sm text-pirrot-blue-100/80">
              <div>
                <p className="font-semibold text-white">{school.schoolName}</p>
                <p>{school.contactName}</p>
                <p>{school.email}</p>
                {school.phone ? <p>{school.phone}</p> : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SchoolAddress
                  label="Rechnungsadresse"
                  address={school.billingAddress}
                />
                <SchoolAddress
                  label="Lieferadresse"
                  address={school.shippingAddress}
                />
              </div>
              {school.customerNote ? (
                <div>
                  <p className="font-semibold text-white">Anmerkung</p>
                  <p className="whitespace-pre-wrap">{school.customerNote}</p>
                </div>
              ) : null}
            </div>
          ) : data.user ? (
            <div className="flex flex-col gap-1 text-sm text-pirrot-blue-100/80">
              <span className="font-semibold text-white">
                {data.user.name ?? "Ohne Namen"}
              </span>
              <span>{data.user.email}</span>
              <Link
                href={`/dashboard/kunden/manage?userId=${data.user.id}`}
                className="btn-secondary mt-3 w-fit px-3 py-1.5 text-sm"
              >
                Kundenprofil öffnen
              </Link>
            </div>
          ) : (
            <p className="text-sm text-pirrot-blue-100/70">
              Gastbestellung ohne Nutzerkonto.
            </p>
          )}
        </section>

        <section className="glass-card-soft flex flex-col gap-4 p-5">
          <h4 className="text-lg font-bold text-white">Planer</h4>
          {book ? (
            <div className="grid gap-3 text-sm text-pirrot-blue-100/80 sm:grid-cols-2">
              <div className="field-shell p-3">
                <p className="compact-label text-[11px] uppercase text-pirrot-blue-200/65">
                  Name
                </p>
                <p className="mt-1 font-semibold text-white">
                  {book.name ?? book.bookTitle ?? "–"}
                </p>
              </div>
              <div className="field-shell p-3">
                <p className="compact-label text-[11px] uppercase text-pirrot-blue-200/65">
                  Menge
                </p>
                <p className="mt-1 font-semibold text-white">
                  {data.bookOrder?.quantity ?? 0} Stück
                </p>
              </div>
              <div className="field-shell p-3">
                <p className="compact-label text-[11px] uppercase text-pirrot-blue-200/65">
                  Format / Bindung / Region
                </p>
                <p className="mt-1 font-semibold text-white">
                  {book.format === "A4" || book.format === "A5"
                    ? `DIN ${book.format}`
                    : book.format}
                  {binding ? ` · ${binding}` : ""}
                  {book.region ? ` · ${book.region}` : ""}
                </p>
              </div>
              <div className="field-shell p-3">
                <p className="compact-label text-[11px] uppercase text-pirrot-blue-200/65">
                  Zeitraum
                </p>
                <p className="mt-1 font-semibold text-white">
                  {formatDate(book.planStart)}
                  {book.planEnd ? ` – ${formatDate(book.planEnd)}` : ""}
                </p>
              </div>
              <div className="field-shell p-3 sm:col-span-2">
                <p className="compact-label text-[11px] uppercase text-pirrot-blue-200/65">
                  Inhalt
                </p>
                <p className="mt-1 font-semibold text-white">
                  {book._count.modules} Module · {book._count.customDates}{" "}
                  eigene Termine
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-pirrot-blue-100/70">
              Kein Planer verknüpft.
            </p>
          )}
          {school && book ? (
            <button
              type="button"
              className="btn-secondary w-fit"
              onClick={() => void downloadSchoolPlanner(book.id)}
              disabled={printing}
            >
              {printing
                ? "Druck-PDF wird erstellt …"
                : "Druck-PDF herunterladen"}
            </button>
          ) : null}
        </section>

        <section className="glass-card-soft flex flex-col gap-4 p-5">
          <h4 className="text-lg font-bold text-white">
            {school ? "Zahlung auf Rechnung" : "Zahlung"}
          </h4>
          {payment ? (
            <div className="grid gap-3 text-sm text-pirrot-blue-100/80 sm:grid-cols-2">
              <div className="field-shell p-3">
                <p className="compact-label text-[11px] uppercase text-pirrot-blue-200/65">
                  Produkt
                </p>
                <p className="mt-1 font-semibold text-white">
                  {formatCents(payment.price, payment.currency)}
                </p>
              </div>
              <div className="field-shell p-3">
                <p className="compact-label text-[11px] uppercase text-pirrot-blue-200/65">
                  Versandkosten
                </p>
                <p className="mt-1 font-semibold text-white">
                  {formatCents(payment.shippingCost, payment.currency)}
                </p>
              </div>
              <div className="field-shell p-3">
                <p className="compact-label text-[11px] uppercase text-pirrot-blue-200/65">
                  Gesamt
                </p>
                <p className="mt-1 text-lg font-black text-white">
                  {formatCents(payment.total, payment.currency)}
                </p>
              </div>
              <div className="field-shell p-3">
                <p className="compact-label text-[11px] uppercase text-pirrot-blue-200/65">
                  Status
                </p>
                <p className="mt-2">
                  <StatusBadge
                    status={payment.status}
                    map={PAYMENT_STATUS_META}
                  />
                </p>
              </div>
              {payment.refundedAt ? (
                <div className="field-shell p-3 sm:col-span-2">
                  <p className="compact-label text-[11px] uppercase text-pirrot-blue-200/65">
                    Erstattung
                  </p>
                  <p className="mt-1 font-semibold text-white">
                    {formatDateTime(payment.refundedAt)}
                    {payment.refundId ? ` · ${payment.refundId}` : ""}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-pirrot-blue-100/70">
              Keine Zahlung verknüpft.
            </p>
          )}
          {school && payment && data.status !== "CANCELED" ? (
            <form
              className="flex flex-col gap-3 border-t border-pirrot-blue-200/10 pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                updateSchoolInvoice.mutate({
                  orderId,
                  invoiceNumber,
                  paid: invoicePaid,
                });
              }}
            >
              <label className="flex flex-col gap-1.5 text-sm text-pirrot-blue-100/80">
                Rechnungsnummer
                <input
                  className="soft-input"
                  maxLength={120}
                  value={invoiceNumber}
                  onChange={(event) => setInvoiceNumber(event.target.value)}
                />
              </label>
              <label className="flex w-fit items-center gap-2 text-sm text-pirrot-blue-100/80">
                <input
                  type="checkbox"
                  checked={invoicePaid}
                  onChange={(event) => setInvoicePaid(event.target.checked)}
                />
                Zahlung eingegangen
              </label>
              <button
                type="submit"
                className="btn-primary w-fit"
                disabled={
                  updateSchoolInvoice.isPending ||
                  (invoiceNumber.trim() === (school.invoiceNumber ?? "") &&
                    invoicePaid === (payment.status === "SUCCEEDED"))
                }
              >
                {updateSchoolInvoice.isPending
                  ? "Speichert …"
                  : "Rechnungsdaten speichern"}
              </button>
            </form>
          ) : null}
        </section>

        <section className="glass-card-soft flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-lg font-bold text-white">Versand</h4>
            {data.shipping ? (
              <StatusBadge
                status={data.shipping.status}
                map={DELIVERY_STATUS_META}
              />
            ) : null}
          </div>
          <div className="flex flex-col gap-3 text-sm text-pirrot-blue-100/80">
            <label className="flex flex-col gap-2">
              Versandstatus
              <select
                value={shippingStatusDraft}
                onChange={(event) =>
                  setShippingStatusDraft(
                    event.target
                      .value as (typeof DELIVERY_STATUS_OPTIONS)[number],
                  )
                }
                className="soft-input"
              >
                {DELIVERY_STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {DELIVERY_STATUS_META[option]?.label ?? option}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              Sendungsnummer
              <input
                value={trackIdDraft}
                onChange={(event) => setTrackIdDraft(event.target.value)}
                placeholder="z. B. DHL-Tracking"
                className="soft-input"
              />
            </label>
            <label className="flex flex-col gap-2">
              Versandtitel
              <input
                value={shippingTitleDraft}
                onChange={(event) => setShippingTitleDraft(event.target.value)}
                placeholder="z. B. Teillieferung 1"
                className="soft-input"
              />
            </label>
            {data.shipping?.shippedAt ? (
              <p className="text-xs text-pirrot-blue-100/60">
                Versendet am {formatDateTime(data.shipping.shippedAt)}
              </p>
            ) : null}
            <button
              type="button"
              className="btn-primary mt-1 w-fit"
              disabled={updateShipping.isPending}
              onClick={() =>
                updateShipping.mutate({
                  orderId: data.id,
                  status: shippingStatusDraft,
                  trackId: trackIdDraft.trim() || undefined,
                  title: shippingTitleDraft.trim() || undefined,
                })
              }
            >
              {updateShipping.isPending
                ? "Speichert …"
                : "Versand aktualisieren"}
            </button>
          </div>
        </section>
      </div>

      {data.partnerOrder ? (
        <section className="glass-card-soft flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h4 className="text-lg font-bold text-white">Partner-Bestellung</h4>
            <p className="mt-1 text-sm text-pirrot-blue-100/70">
              {data.partnerOrder.partnerUser?.email ?? "Unbekannter Partner"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge
              status={data.partnerOrder.status}
              map={PARTNER_ORDER_STATUS_META}
            />
            <Link href="/dashboard/fulfillment" className="btn-secondary">
              Zum Fulfillment
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
