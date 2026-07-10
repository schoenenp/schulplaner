"use client";

import { useRef, useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import {
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  TrashIcon,
} from "@heroicons/react/16/solid";

import { api } from "@/trpc/react";
import ConfirmDeleteDialog from "@/app/_components/confirm-delete-dialog";
import LoadingSpinner from "@/app/_components/loading-spinner";
import { useToast } from "@/app/_components/toast";
import { formatDate } from "@/util/format";

type PdfMode = "preview" | "print";

function toSafeFileName(input: string): string {
  const cleaned = input
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "planer";
}

const KIND_FILTERS = [
  { value: "ALL", label: "Alle" },
  { value: "TEMPLATE", label: "Vorlagen" },
  { value: "PLANNER", label: "Planer" },
] as const;

type KindFilter = (typeof KIND_FILTERS)[number]["value"];

type FlagKey = "isTemplate" | "isFeatured" | "isPublic";

const FLAGS: Array<{ key: FlagKey; label: string }> = [
  { key: "isTemplate", label: "Vorlage" },
  { key: "isFeatured", label: "Featured" },
  { key: "isPublic", label: "Öffentlich" },
];

export default function PlannerTable() {
  const utils = api.useUtils();
  const toast = useToast();
  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState<string | undefined>(undefined);
  const [kind, setKind] = useState<KindFilter>("ALL");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [generatingPdf, setGeneratingPdf] = useState<
    { bookId: string; mode: PdfMode } | undefined
  >();
  const [deleteTarget, setDeleteTarget] = useState<
    { bookId: string; name: string } | undefined
  >();
  const previewUrlRef = useRef<string | undefined>(undefined);

  const overview = api.planner.getOverview.useQuery();
  const planners = api.planner.getAll.useQuery(
    { query, kind, includeDeleted, page, pageSize: 20 },
    { placeholderData: keepPreviousData },
  );

  async function refresh() {
    await utils.planner.invalidate();
  }

  const setFlags = api.planner.setFlags.useMutation({
    onSuccess: refresh,
    onError: (error) => toast.show(error.message, "error"),
  });
  const softDelete = api.planner.softDelete.useMutation({
    onSuccess: async () => {
      setDeleteTarget(undefined);
      await refresh();
    },
    onError: (error) => {
      setDeleteTarget(undefined);
      toast.show(error.message, "error");
    },
  });
  const restore = api.planner.restore.useMutation({
    onSuccess: refresh,
    onError: (error) => toast.show(error.message, "error"),
  });

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(searchDraft.trim() === "" ? undefined : searchDraft.trim());
    setPage(1);
  }

  /**
   * Runs the genbooks PDF pipeline in the browser. "preview" renders the full
   * planner with watermark (safe to share with clients), "print" the
   * unwatermarked full-quality file for test prints.
   */
  async function generatePdf(bookId: string, mode: PdfMode) {
    setGeneratingPdf({ bookId, mode });
    const toastId = toast.show(
      mode === "preview"
        ? "Vorschau wird erzeugt … das kann bei großen Planern etwas dauern."
        : "Druck-PDF wird erzeugt … das kann bei großen Planern etwas dauern.",
      "loading",
    );
    try {
      const source = await utils.planner.getPdfSource.fetch({ bookId });
      const { processPdfModules } = await import("@/util/pdf");

      const result = await processPdfModules(
        source.bookDetails,
        source.modules,
        {
          format: source.format,
          colorMap: new Map(source.colorEntries),
          ...(mode === "preview" ? { addWatermark: true } : {}),
        },
      );

      const blob = new Blob([result.pdfFile as BlobPart], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);

      if (mode === "preview") {
        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
        }
        previewUrlRef.current = url;
        const opened = window.open(url, "_blank");
        if (opened) {
          toast.update(toastId, "Vorschau wurde geöffnet.", "success");
        } else {
          toast.update(
            toastId,
            "Popup wurde blockiert – bitte Popups für das Panel erlauben.",
            "error",
          );
        }
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${toSafeFileName(source.fileName)}-druck.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
        toast.update(
          toastId,
          "Druck-PDF wird heruntergeladen.",
          "success",
        );
      }
    } catch (error) {
      toast.update(
        toastId,
        error instanceof Error
          ? error.message
          : "PDF konnte nicht erstellt werden.",
        "error",
      );
    } finally {
      setGeneratingPdf(undefined);
    }
  }

  const items = planners.data?.items ?? [];
  const pageCount = planners.data?.pageCount ?? 1;

  return (
    <div className="flex flex-col gap-6">
      <ConfirmDeleteDialog
        show={deleteTarget !== undefined}
        message={`„${deleteTarget?.name ?? ""}" wird gelöscht und aus dem Shop entfernt. Der Planer kann über „Gelöschte anzeigen" wiederhergestellt werden.`}
        isPending={softDelete.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            softDelete.mutate({ bookId: deleteTarget.bookId });
          }
        }}
        onCancel={() => setDeleteTarget(undefined)}
      />

      <section className="dashboard-metric-grid grid gap-4">
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Vorlagen
          </p>
          <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {overview.data?.totalTemplates ?? "–"}
          </p>
          <p className="mt-2 text-sm text-pirrot-blue-100/70">
            {overview.data
              ? `${overview.data.featuredTemplates} featured`
              : ""}
          </p>
        </div>
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Planer
          </p>
          <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {overview.data?.totalPlanners ?? "–"}
          </p>
          <p className="mt-2 text-sm text-pirrot-blue-100/70">
            Nutzer-Konfigurationen
          </p>
        </div>
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Module im Katalog
          </p>
          <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {overview.data?.totalModules ?? "–"}
          </p>
          <p className="mt-2 text-sm text-pirrot-blue-100/70">
            {overview.data
              ? `${overview.data.visibility.PUBLIC ?? 0} öffentlich`
              : ""}
          </p>
        </div>
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Stärkster Modultyp
          </p>
          <p className="mt-4 truncate text-2xl font-black text-white">
            {overview.data?.modulesByType[0]?.typeName ?? "–"}
          </p>
          <p className="mt-2 text-sm text-pirrot-blue-100/70">
            {overview.data?.modulesByType[0]
              ? `${overview.data.modulesByType[0].count} Module`
              : ""}
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
              placeholder="Suche nach Name, Titel oder Ersteller …"
              className="soft-input soft-input-leading"
            />
          </form>
          <div className="flex flex-wrap items-center gap-2">
            {KIND_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => {
                  setKind(filter.value);
                  setPage(1);
                }}
                className={
                  kind === filter.value
                    ? "btn-primary px-3 py-1.5 text-sm"
                    : "btn-secondary px-3 py-1.5 text-sm"
                }
              >
                {filter.label}
              </button>
            ))}
            <label className="ml-2 flex items-center gap-2 text-sm text-pirrot-blue-100/80">
              <input
                type="checkbox"
                checked={includeDeleted}
                onChange={(event) => {
                  setIncludeDeleted(event.target.checked);
                  setPage(1);
                }}
                className="size-4 accent-pirrot-blue-500"
              />
              Gelöschte anzeigen
            </label>
          </div>
        </div>

        {planners.isPending ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-sm text-pirrot-blue-100/70">
            Keine Planer gefunden.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-pirrot-blue-200/10 text-xs uppercase tracking-wide text-pirrot-blue-200/70">
                  <th className="px-3 py-3 font-semibold">Planer</th>
                  <th className="px-3 py-3 font-semibold">Ersteller</th>
                  <th className="px-3 py-3 font-semibold">Format</th>
                  <th className="px-3 py-3 font-semibold">Module</th>
                  <th className="px-3 py-3 font-semibold">Bestellungen</th>
                  <th className="px-3 py-3 font-semibold">Flags</th>
                  <th className="px-3 py-3 font-semibold">Aktualisiert</th>
                  <th className="px-3 py-3 font-semibold">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {items.map((book) => (
                  <tr
                    key={book.id}
                    className={`border-b border-pirrot-blue-200/5 text-pirrot-blue-50 ${
                      book.deletedAt ? "opacity-50" : ""
                    }`}
                  >
                    <td className="max-w-56 px-3 py-3">
                      <p className="truncate font-semibold text-white">
                        {book.name ?? book.bookTitle ?? "Ohne Namen"}
                      </p>
                      <p className="truncate text-xs text-pirrot-blue-100/60">
                        {book.sourceType}
                        {book.deletedAt ? " · gelöscht" : ""}
                      </p>
                    </td>
                    <td className="max-w-52 truncate px-3 py-3">
                      {book.createdBy?.email ?? "–"}
                    </td>
                    <td className="px-3 py-3">
                      {book.format}
                      {book.region ? ` · ${book.region}` : ""}
                    </td>
                    <td className="px-3 py-3">{book._count.modules}</td>
                    <td className="px-3 py-3">{book._count.ordered}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {FLAGS.map((flag) => {
                          const isOn = book[flag.key];
                          return (
                            <button
                              key={flag.key}
                              type="button"
                              disabled={
                                setFlags.isPending || Boolean(book.deletedAt)
                              }
                              onClick={() =>
                                setFlags.mutate({
                                  bookId: book.id,
                                  [flag.key]: !isOn,
                                })
                              }
                              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase transition ${
                                isOn
                                  ? "border-pirrot-blue-300/40 bg-pirrot-blue-500/80 text-white"
                                  : "border-pirrot-blue-200/15 bg-slate-950/40 text-pirrot-blue-100/50 hover:text-pirrot-blue-100"
                              }`}
                              title={`${flag.label} umschalten`}
                            >
                              {flag.label}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {formatDate(book.updatedAt)}
                    </td>
                    <td className="px-3 py-3">
                      {book.deletedAt ? (
                        <button
                          type="button"
                          className="btn-secondary gap-1.5 px-3 py-1.5 text-xs"
                          disabled={restore.isPending}
                          onClick={() => restore.mutate({ bookId: book.id })}
                        >
                          <ArrowUturnLeftIcon className="size-3.5" />
                          Wiederherstellen
                        </button>
                      ) : (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            className="btn-secondary px-3 py-1.5 text-xs"
                            disabled={generatingPdf !== undefined}
                            onClick={() => generatePdf(book.id, "preview")}
                            aria-label="Vorschau-PDF öffnen"
                            title="Vorschau mit Wasserzeichen erzeugen und öffnen"
                          >
                            <EyeIcon
                              className={`size-3.5 ${
                                generatingPdf?.bookId === book.id &&
                                generatingPdf.mode === "preview"
                                  ? "animate-pulse"
                                  : ""
                              }`}
                            />
                          </button>
                          <button
                            type="button"
                            className="btn-secondary px-3 py-1.5 text-xs"
                            disabled={generatingPdf !== undefined}
                            onClick={() => generatePdf(book.id, "print")}
                            aria-label="Druck-PDF herunterladen"
                            title="Finales Druck-PDF in voller Qualität herunterladen"
                          >
                            <ArrowDownTrayIcon
                              className={`size-3.5 ${
                                generatingPdf?.bookId === book.id &&
                                generatingPdf.mode === "print"
                                  ? "animate-pulse"
                                  : ""
                              }`}
                            />
                          </button>
                          <button
                            type="button"
                            className="btn-secondary px-3 py-1.5 text-xs"
                            disabled={softDelete.isPending}
                            onClick={() =>
                              setDeleteTarget({
                                bookId: book.id,
                                name:
                                  book.name ?? book.bookTitle ?? "Ohne Namen",
                              })
                            }
                            aria-label="Planer löschen"
                            title={
                              book._count.ordered > 0
                                ? "Planer mit Bestellungen können nicht gelöscht werden"
                                : "Planer löschen"
                            }
                          >
                            <TrashIcon className="size-3.5" />
                          </button>
                        </div>
                      )}
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
            {planners.data ? ` · ${planners.data.total} Einträge` : ""}
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
