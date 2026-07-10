"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/trpc/react";
import { DashboardSkeleton } from "@/app/dashboard/_components/dashboard-states";
import { AlertCircle, CheckCircle2, Eye } from "lucide-react";
import { processPdfModulesPreview } from "@/util/pdf";
import type { ColorCode, ModuleId } from "@/app/_components/module-changer";
import Link from "next/link";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("de-DE");
}

function formatMoney(cents: number | null): string {
  if (cents == null) return "-";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export default function PartnerPlannerPreview(props: { partnerOrderId: string }) {
  const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const preview = api.partner.getPartnerOrderPlannerPreview.useQuery(
    { partnerOrderId: props.partnerOrderId },
    { enabled: props.partnerOrderId.length > 0, retry: 0 },
  );
  const order = preview.data;
  const modules = useMemo(() => order?.book.modules ?? [], [order?.book.modules]);
  const transitions = Array.isArray(order?.transitions) ? order.transitions : [];
  const getPartnerOrderStatusLabel = (status: string) => {
    switch (status) {
      case "SUBMITTED_BY_SCHOOL":
        return "Von Schule eingereicht";
      case "UNDER_PARTNER_REVIEW":
        return "In Partner-Prüfung";
      case "PARTNER_CONFIRMED":
        return "Vom Partner bestätigt";
      case "PARTNER_DECLINED":
        return "Vom Partner abgelehnt";
      case "RELEASED_TO_PRODUCTION":
        return "Für Produktion freigegeben";
      case "FULFILLED":
        return "Erfüllt";
      default:
        return status;
    }
  };
  const hasCover = modules.some(
    (moduleItem) => moduleItem.module.type.name === "umschlag",
  );
  const schoolSnapshot = asRecord(order?.schoolSnapshot);
  const lineItems = asRecord(order?.lineItemsSnapshot);
  const partnerSnapshot = asRecord(order?.partnerSnapshot);
  const schoolAddress = asRecord(schoolSnapshot?.address);

  const pdfModules = useMemo(
    () =>
      modules.map((moduleItem) => ({
        id: moduleItem.module.id,
        idx: moduleItem.idx,
        type: moduleItem.module.type.name,
        pdfUrl: moduleItem.modulePdfUrl,
        coverImageUrl: moduleItem.coverImageUrl ?? undefined,
        pageCount: moduleItem.modulePageCount ?? null,
        grayscalePdfUrl: moduleItem.moduleGrayscalePdfUrl ?? null,
      })),
    [modules],
  );

  useEffect(() => {
    return () => {
      if (previewFileUrl) {
        URL.revokeObjectURL(previewFileUrl);
      }
    };
  }, [previewFileUrl]);

  async function handleGeneratePreview() {
    if (!order) {
      setPreviewError("Bestellung konnte nicht geladen werden.");
      return;
    }
    if (!hasCover) {
      setPreviewError(
        "Keine Umschlag-Datei gefunden. Vorschau-PDF kann nicht erzeugt werden.",
      );
      return;
    }
    setIsGeneratingPreview(true);
    setPreviewError(null);

    try {
      const colorMap = new Map<ModuleId, ColorCode>();
      for (const moduleItem of order.book.modules) {
        colorMap.set(
          moduleItem.module.id,
          moduleItem.colorCode === "COLOR" ? 4 : 1,
        );
      }

      const result = await processPdfModulesPreview(
        {
          title: order.book.bookTitle ?? "Partner-Planer",
          period: {
            start: order.book.planStart,
            end: order.book.planEnd ?? undefined,
          },
          code: order.book.region ?? "DE-SL",
          country: order.book.country ?? "DE",
          addHolidays: true,
          customDates: order.book.customDates.map((entry) => ({
            name: entry.name,
            date: entry.date.toISOString(),
          })),
        },
        pdfModules,
        {
          format:
            order.book.format === "DIN A4" || order.book.format === "DIN A5"
              ? order.book.format
              : "DIN A5",
          colorMap,
        },
      );

      const blob = new Blob([result.pdfFile as BlobPart], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      setPreviewFileUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return url;
      });
    } catch {
      setPreviewError(
        "Vorschau konnte nicht generiert werden. Bitte später erneut versuchen.",
      );
    } finally {
      setIsGeneratingPreview(false);
    }
  }

  if (!props.partnerOrderId) {
    return (
      <div className="content-card p-6 text-sm text-pirrot-red-600">
        Partner-Bestellung fehlt. Bitte mit gültiger `partnerOrderId` öffnen.
      </div>
    );
  }

  if (preview.isLoading) {
    return <DashboardSkeleton rows={4} />;
  }

  if (preview.error || !order) {
    return (
      <div className="content-card flex flex-col gap-2 p-6 text-pirrot-red-600">
        <div className="flex items-center gap-2 font-semibold">
          <AlertCircle className="size-4" />
          Vorschau konnte nicht geladen werden
        </div>
        <p className="text-sm">
          {preview.error?.message ?? "Bitte später erneut versuchen."}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="content-card p-5">
        <div className="mb-3">
          <Link
            href="/dashboard?view=partner"
            className="btn-soft inline-flex px-3 py-1.5 text-xs"
          >
            Zurück zum Partner-Bereich
          </Link>
        </div>
        <div className="mb-3 flex items-center gap-2">
          <Eye className="size-5 text-pirrot-blue-700" />
          <h1 className="text-2xl font-black uppercase text-info-950">
            Planer-Vorschau (Read-Only)
          </h1>
        </div>
        <p className="text-sm text-info-700">
          Diese Ansicht ist nur zur Prüfung durch den Partner. Änderungen sind hier nicht möglich.
        </p>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div className="field-shell px-3 py-2">Bestellung: <b>{order.id}</b></div>
          <div className="field-shell px-3 py-2">Status: <b>{getPartnerOrderStatusLabel(order.status)}</b></div>
          <div className="field-shell px-3 py-2">Planer: <b>{order.book.name}</b></div>
          <div className="field-shell px-3 py-2">Format: <b>{order.book.format}</b></div>
          <div className="field-shell px-3 py-2">Eingereicht: <b>{formatDateTime(order.submittedAt)}</b></div>
          <div className="field-shell px-3 py-2">Geprüft: <b>{formatDateTime(order.reviewedAt)}</b></div>
          <div className="field-shell px-3 py-2">Freigegeben: <b>{formatDateTime(order.releasedAt)}</b></div>
          <div className="field-shell px-3 py-2">Auftragsschlüssel: <b>{order.order?.orderKey ?? "-"}</b></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleGeneratePreview()}
            disabled={isGeneratingPreview}
            className="btn-solid px-4 py-2 disabled:opacity-60"
          >
            {isGeneratingPreview
              ? "Vorschau wird erstellt..."
              : "Vorschau-PDF generieren"}
          </button>
          {previewFileUrl ? (
            <a
              href={previewFileUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-soft px-4 py-2"
            >
              Vorschau öffnen
            </a>
          ) : null}
        </div>
        {previewError ? (
          <p className="mt-3 text-sm text-pirrot-red-600">{previewError}</p>
        ) : null}
        {order.declineReason ? (
          <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Ablehnungsgrund: {order.declineReason}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="content-card p-5">
          <h2 className="text-lg font-black text-info-950">Schuldaten</h2>
          <div className="mt-3 grid gap-2 text-sm">
            <div className="field-shell px-3 py-2">Name: <b>{asString(schoolSnapshot?.name) ?? "-"}</b></div>
            <div className="field-shell px-3 py-2">Organisation: <b>{asString(schoolSnapshot?.org) ?? "-"}</b></div>
            <div className="field-shell px-3 py-2">E-Mail: <b>{asString(schoolSnapshot?.email) ?? order.schoolUser?.email ?? "-"}</b></div>
            <div className="field-shell px-3 py-2">Telefon: <b>{asString(schoolSnapshot?.phone) ?? "-"}</b></div>
            <div className="field-shell px-3 py-2">
              Adresse: <b>{[asString(schoolAddress?.line1), asString(schoolAddress?.postal_code), asString(schoolAddress?.city), asString(schoolAddress?.country)].filter(Boolean).join(", ") || "-"}</b>
            </div>
          </div>
        </div>

        <div className="content-card p-5">
          <h2 className="text-lg font-black text-info-950">Preis-Snapshot</h2>
          <div className="mt-3 grid gap-2 text-sm">
            <div className="field-shell px-3 py-2">Menge: <b>{asNumber(lineItems?.quantity) ?? "-"}</b></div>
            <div className="field-shell px-3 py-2">Basis je Stück: <b>{formatMoney(asNumber(lineItems?.baseUnitAmount))}</b></div>
            <div className="field-shell px-3 py-2">Basis gesamt: <b>{formatMoney(asNumber(lineItems?.baseTotalAmount))}</b></div>
            <div className="field-shell px-3 py-2">Add-on je Stück: <b>{formatMoney(asNumber(lineItems?.addOnUnitAmount))}</b></div>
            <div className="field-shell px-3 py-2">Add-on gesamt: <b>{formatMoney(asNumber(lineItems?.addOnTotalAmount))}</b></div>
            <div className="field-shell px-3 py-2">Zusatzmodule: <b>{asString(lineItems?.addOnModules) ?? "-"}</b></div>
          </div>
        </div>
      </div>

      <div className="content-card p-5">
        <h2 className="text-lg font-black text-info-950">Rechnung & Herkunft</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div className="field-shell px-3 py-2">Kampagnen-ID: <b>{order.sourceCampaignId ?? "-"}</b></div>
          <div className="field-shell px-3 py-2">Claim-ID: <b>{order.sourceClaimId ?? "-"}</b></div>
          <div className="field-shell px-3 py-2">
            Rechnungsaussteller:{" "}
            <b>{asString(asRecord(partnerSnapshot?.invoiceIssuer)?.partnerName) ?? "-"}</b>
          </div>
          <div className="field-shell px-3 py-2">
            Schulrechnung:{" "}
            <b>{asString(asRecord(partnerSnapshot?.schoolInvoice)?.invoiceId) ?? "-"}</b>
          </div>
        </div>
      </div>

      <div className="content-card p-5">
        <h2 className="text-lg font-black text-info-950">Module</h2>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {order.book.modules.map((moduleItem) => (
            <li key={`${moduleItem.module.id}-${moduleItem.idx}`} className="field-shell flex items-center justify-between px-3 py-2">
              <span>
                <b>#{moduleItem.idx}</b> · {moduleItem.module.name}
              </span>
              <span className="text-info-700">
                {moduleItem.module.part} · {moduleItem.module.type.name}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 inline-flex items-center gap-2 text-xs text-info-700">
          <CheckCircle2 className="size-4 text-pirrot-green-600" />
          Read-only Partneransicht vor Produktionsfreigabe.
        </p>
      </div>

      <div className="content-card p-5">
        <h2 className="text-lg font-black text-info-950">Statushistorie</h2>
        {transitions.length === 0 ? (
          <p className="mt-3 text-sm text-info-700">Noch keine Historie vorhanden.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {transitions.map((entry) => (
              <li key={entry.id} className="field-shell flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  {getPartnerOrderStatusLabel(entry.fromStatus ?? "SUBMITTED_BY_SCHOOL")}{" "}
                  {"->"}{" "}
                  <b>{getPartnerOrderStatusLabel(entry.toStatus ?? order.status)}</b>
                </span>
                <span className="text-info-700">
                  {formatDateTime(entry.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
