"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/16/solid";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import ConfirmDeleteDialog from "@/app/_components/confirm-delete-dialog";
import Modal from "@/app/_components/modal";
import { api } from "@/trpc/react";
import { getPageRules } from "@/server/util/pdf/functions";

const ITEMS_PER_PAGE = 12;
const CDN_BASE =
  process.env.NEXT_PUBLIC_CDN_BASE_URL ?? "https://cdn.pirrot.de";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
  }).format(date);
}

function toPreviewSrc(src: string) {
  if (src === "/default.png") return src;
  if (src.startsWith("https://")) return src;
  return `${CDN_BASE}${src.startsWith("/") ? "" : "/"}${src}`;
}

const visibilityTheme = {
  PUBLIC: "border-success-400/20 bg-success-950/35 text-success-200",
  SHARED:
    "border-pirrot-blue-300/20 bg-pirrot-blue-950/70 text-pirrot-blue-100",
  PRIVATE: "border-warning-400/20 bg-warning-950/35 text-warning-200",
} as const;

export default function ModuleGrid() {
  const router = useRouter();
  const utils = api.useUtils();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [visibility, setVisibility] = useState<
    "" | "PUBLIC" | "SHARED" | "PRIVATE"
  >("");
  const [type, setType] = useState("");
  const [origin, setOrigin] = useState<"" | "CATALOG" | "USER">("");
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<
    { id: string; name: string } | undefined
  >();

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCurrentPage(1);
    }, 250);

    return () => clearTimeout(timeout);
  }, [search]);

  const { data, isLoading, isFetching } = api.module.getAll.useQuery(
    {
      search: debouncedSearch || undefined,
      type: type || undefined,
      visibility: visibility || undefined,
      origin: origin || undefined,
      page: currentPage,
      limit: ITEMS_PER_PAGE,
    },
    {
      placeholderData: (previousData) => previousData,
    },
  );

  const { data: insights } = api.module.getInsights.useQuery();
  const { data: types = [] } = api.type.getAll.useQuery();

  const items = data?.items ?? [];
  const pagination = data?.pagination ?? {
    page: 1,
    limit: ITEMS_PER_PAGE,
    total: 0,
    totalPages: 1,
  };

  const deleteModule = api.module.delete.useMutation({
    onSuccess: async () => {
      setDeleteTarget(undefined);
      await Promise.all([
        utils.module.getAll.invalidate(),
        utils.module.getInsights.invalidate(),
      ]);
    },
    onError: (error) => {
      setDeleteTarget(undefined);
      setDeleteError(error.message);
    },
  });

  function handleClearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setVisibility("");
    setType("");
    setOrigin("");
    setCurrentPage(1);
    searchInputRef.current?.focus();
  }

  const hasActiveFilters =
    debouncedSearch.length > 0 ||
    visibility.length > 0 ||
    type.length > 0 ||
    origin.length > 0;

  const statCards = useMemo(() => {
    const summary = insights?.summary;
    const visibleCount =
      (insights?.visibilityBreakdown.find(
        (entry) => entry.visibility === "PUBLIC",
      )?.count ?? 0) +
      (insights?.visibilityBreakdown.find(
        (entry) => entry.visibility === "SHARED",
      )?.count ?? 0);

    return [
      {
        label: "Katalog",
        value: summary?.totalModules ?? 0,
        detail: `${visibleCount} sichtbar`,
      },
      {
        label: "Ohne Datei",
        value: summary?.missingFileCount ?? 0,
        detail: "brauchen Upload oder Prüfung",
      },
      {
        label: "Ohne Preview",
        value: summary?.missingPreviewCount ?? 0,
        detail: "fehlen im visuellen Katalog",
      },
      {
        label: "Ohne Tags",
        value: summary?.untaggedCount ?? 0,
        detail: "noch keine Feldzuordnung",
      },
    ];
  }, [insights]);

  function getPageNumbers(): (number | "...")[] {
    const total = pagination.totalPages;
    const current = currentPage;

    if (total <= 7) {
      return Array.from({ length: total }, (_, index) => index + 1);
    }

    const pages: (number | "...")[] = [1];
    if (current > 3) pages.push("...");

    for (
      let index = Math.max(2, current - 1);
      index <= Math.min(total - 1, current + 1);
      index++
    ) {
      pages.push(index);
    }

    if (current < total - 2) pages.push("...");
    pages.push(total);

    return pages;
  }

  return (
    <div className="flex flex-col gap-6">
      <ConfirmDeleteDialog
        show={deleteTarget !== undefined}
        message={`Das Modul „${deleteTarget?.name ?? ""}" wird endgültig aus dem Katalog gelöscht.`}
        isPending={deleteModule.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteModule.mutate({ id: deleteTarget.id });
          }
        }}
        onCancel={() => setDeleteTarget(undefined)}
      />

      <Modal selector="modal-hook" show={deleteError !== undefined}>
        <div className="fixed inset-0 z-[69] flex items-center justify-center bg-slate-950/80 p-4">
          <div className="glass-card w-full max-w-lg p-5">
            <h3 className="text-xl font-bold text-white">
              Löschen fehlgeschlagen
            </h3>
            <p className="mt-2 text-sm text-pirrot-blue-100/75">
              {deleteError}
            </p>
            <button
              type="button"
              onClick={() => setDeleteError(undefined)}
              className="btn-primary mt-5"
            >
              Schließen
            </button>
          </div>
        </div>
      </Modal>

      <section className="dashboard-metric-grid grid gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="metric-card">
            <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
              {card.label}
            </p>
            <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
              {card.value}
            </p>
            <p className="mt-2 text-sm text-pirrot-blue-100/65">
              {card.detail}
            </p>
          </div>
        ))}
      </section>

      <section className="glass-card-soft flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="compact-label text-xs font-semibold uppercase text-pirrot-blue-200/70">
              Filter
            </p>
            <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">
              Bestand gezielt durchsuchen
            </h3>
          </div>
          <div className="shrink-0 text-sm text-pirrot-blue-100/70">
            {isLoading
              ? "Module werden geladen..."
              : `${pagination.total} Treffer`}
            {isFetching && !isLoading ? " · wird aktualisiert" : ""}
          </div>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(16rem,1fr)_minmax(10rem,14rem)_minmax(10rem,14rem)_minmax(10rem,14rem)_auto]">
          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-pirrot-blue-300/70" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, Thema oder Typ suchen"
              className="soft-input soft-input-leading soft-input-trailing"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-pirrot-blue-200/60 transition hover:text-white"
              >
                <XMarkIcon className="size-4" />
              </button>
            ) : null}
          </div>

          <select
            value={visibility}
            onChange={(event) => {
              setVisibility(
                event.target.value as "" | "PUBLIC" | "SHARED" | "PRIVATE",
              );
              setCurrentPage(1);
            }}
            className="soft-input"
          >
            <option value="">Alle Sichtbarkeiten</option>
            <option value="PUBLIC">PUBLIC</option>
            <option value="SHARED">SHARED</option>
            <option value="PRIVATE">PRIVATE</option>
          </select>

          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setCurrentPage(1);
            }}
            className="soft-input"
          >
            <option value="">Alle Typen</option>
            {types.map((typeItem) => (
              <option key={typeItem.id} value={typeItem.name}>
                {typeItem.name}
              </option>
            ))}
          </select>

          <select
            value={origin}
            onChange={(event) => {
              setOrigin(event.target.value as "" | "CATALOG" | "USER");
              setCurrentPage(1);
            }}
            className="soft-input"
          >
            <option value="">Alle Quellen</option>
            <option value="CATALOG">Katalog</option>
            <option value="USER">Von Nutzern erstellt</option>
          </select>

          <button
            type="button"
            onClick={handleClearFilters}
            className="btn-secondary whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasActiveFilters}
          >
            Filter reset
          </button>
        </div>
      </section>

      <section className="dashboard-card-grid grid gap-5">
        {items.map((item, index) => (
          <article
            key={item.id}
            className="glass-card-soft rise-in hover:bg-pirrot-blue-900/72 group flex min-h-72 flex-col overflow-hidden transition hover:-translate-y-1 hover:border-pirrot-blue-300/30"
            style={{ animationDelay: `${index * 45}ms` }}
          >
            <button
              type="button"
              onClick={() =>
                router.push(`/dashboard/module/manage?moduleId=${item.id}`)
              }
              className="flex h-full flex-col text-left"
            >
              <div className="relative aspect-[16/9] overflow-hidden border-b border-pirrot-blue-200/10 bg-pirrot-blue-950">
                {item.previewSrc !== "/default.png" ? (
                  <div
                    className="size-full bg-cover bg-center transition duration-500 group-hover:scale-[1.03]"
                    style={{
                      backgroundImage: `url(${toPreviewSrc(item.previewSrc)})`,
                    }}
                  />
                ) : (
                  <div className="flex size-full items-center justify-center bg-gradient-to-br from-pirrot-blue-950 via-slate-950 to-pirrot-blue-900">
                    <PhotoIcon className="size-12 text-pirrot-blue-200/30" />
                  </div>
                )}
                <div className="absolute left-3 right-3 top-3 flex flex-wrap gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${visibilityTheme[item.visible]}`}
                  >
                    {item.visible}
                  </span>
                  <span className="rounded-full border border-pirrot-blue-200/10 bg-slate-950/60 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-pirrot-blue-100">
                    {item.part}
                  </span>
                  {item.createdBy ? (
                    <span className="max-w-44 truncate rounded-full border border-pirrot-red-400/20 bg-pirrot-red-950/50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-pirrot-red-200">
                      Von: {item.createdBy}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
                <div>
                  <h3 className="line-clamp-2 text-xl font-black leading-tight text-white sm:text-2xl">
                    {item.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm text-pirrot-blue-100/70">
                    {item.type.name}
                    {item.theme ? ` · ${item.theme}` : " · ohne Thema"}
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="field-shell p-3">
                    <p className="compact-label text-[11px] uppercase text-pirrot-blue-200/65">
                      Tags
                    </p>
                    <p className="mt-1 text-lg font-bold text-white">
                      {item.tagCount}
                    </p>
                  </div>
                  <div className="field-shell p-3">
                    <p className="compact-label text-[11px] uppercase text-pirrot-blue-200/65">
                      Seitenregel
                    </p>
                    <p className="mt-1 text-sm font-semibold leading-snug text-white">
                      {getPageRules({
                        min: item.type.minPages,
                        max: item.type.maxPages,
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.08em] text-pirrot-blue-100/75">
                  <span className="field-shell px-3 py-2">
                    PDF {item.hasPdf ? "ok" : "fehlt"}
                  </span>
                  <span className="field-shell px-3 py-2">
                    Datei {item.hasSourceFile ? "ok" : "fehlt"}
                  </span>
                  <span className="field-shell px-3 py-2">
                    Preview {item.hasThumbnail ? "ok" : "fehlt"}
                  </span>
                  <span className="field-shell flex items-center gap-2 px-3 py-2">
                    <SparklesIcon className="size-3.5" />
                    {formatDate(item.updatedAt)}
                  </span>
                </div>
              </div>
            </button>

            <div className="flex flex-col gap-3 border-t border-pirrot-blue-200/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <button
                type="button"
                onClick={() =>
                  router.push(`/dashboard/module/manage?moduleId=${item.id}`)
                }
                className="btn-secondary flex-1"
              >
                Bearbeiten
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setDeleteTarget({ id: item.id, name: item.name });
                }}
                className="btn-secondary px-3"
                aria-label={`${item.name} löschen`}
              >
                <TrashIcon className="size-5" />
              </button>
            </div>
          </article>
        ))}
      </section>

      {!isLoading && items.length === 0 ? (
        <div className="glass-card-soft flex flex-col items-center justify-center gap-3 px-4 py-14 text-center sm:py-16">
          <div className="bg-pirrot-blue-500/12 flex size-16 items-center justify-center rounded-full text-pirrot-blue-100/70">
            <MagnifyingGlassIcon className="size-8" />
          </div>
          <h3 className="text-2xl font-black text-white">
            Keine Module gefunden
          </h3>
          <p className="max-w-lg text-sm text-pirrot-blue-100/70">
            Für die aktuellen Filter gibt es keinen Treffer. Passen Sie Suche,
            Typ oder Sichtbarkeit an.
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={handleClearFilters}
              className="btn-primary"
            >
              Filter reset
            </button>
          ) : null}
        </div>
      ) : null}

      {pagination.totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() =>
              setCurrentPage((previous) => Math.max(previous - 1, 1))
            }
            disabled={currentPage === 1}
            className="btn-secondary gap-2 disabled:opacity-50"
          >
            <ChevronLeftIcon className="size-4" />
            Zurück
          </button>

          <div className="flex flex-wrap items-center justify-center gap-1">
            {getPageNumbers().map((pageNumber, index) =>
              pageNumber === "..." ? (
                <span
                  key={`ellipsis-${index}`}
                  className="px-2 py-1 text-sm text-pirrot-blue-100/50"
                >
                  ...
                </span>
              ) : (
                <button
                  key={pageNumber}
                  type="button"
                  onClick={() => setCurrentPage(pageNumber)}
                  className={[
                    "rounded-lg px-3 py-2 text-sm font-semibold transition",
                    currentPage === pageNumber
                      ? "bg-pirrot-blue-500 text-white"
                      : "bg-pirrot-blue-950/80 text-pirrot-blue-100 hover:bg-pirrot-blue-900",
                  ].join(" ")}
                >
                  {pageNumber}
                </button>
              ),
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              setCurrentPage((previous) =>
                Math.min(previous + 1, pagination.totalPages),
              )
            }
            disabled={currentPage === pagination.totalPages}
            className="btn-secondary gap-2 disabled:opacity-50"
          >
            Weiter
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
