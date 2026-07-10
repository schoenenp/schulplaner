"use client";

import {
  ClipboardDocumentListIcon,
  TrashIcon,
} from "@heroicons/react/16/solid";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import ConfirmDeleteDialog from "@/app/_components/confirm-delete-dialog";
import Modal from "@/app/_components/modal";
import { api } from "@/trpc/react";
import { getPageRules } from "@/server/util/pdf/functions";

export default function TypeGrid() {
  const [items] = api.type.getAll.useSuspenseQuery();
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<
    { id: string; name: string } | undefined
  >();
  const router = useRouter();
  const utils = api.useUtils();

  const deleteType = api.type.delete.useMutation({
    onSuccess: async () => {
      setDeleteTarget(undefined);
      await utils.type.invalidate();
    },
    onError: (error) => {
      setDeleteTarget(undefined);
      setDeleteError(error.message);
    },
  });

  function handleDeleteType(item: { id: string; name: string; _count: { modules: number } }) {
    if (item._count.modules >= 1) {
      setDeleteError(
        "Typen mit bestehenden Modulen können nicht gelöscht werden.",
      );
      return;
    }

    setDeleteTarget({ id: item.id, name: item.name });
  }

  const summary = useMemo(
    () => ({
      total: items.length,
      withAssignments: items.filter((item) => item._count.modules > 0).length,
      openEnded: items.filter((item) => item.maxPages === -1).length,
    }),
    [items],
  );

  return (
    <div className="flex flex-col gap-6">
      <ConfirmDeleteDialog
        show={deleteTarget !== undefined}
        message={`Der Typ „${deleteTarget?.name ?? ""}" wird endgültig gelöscht.`}
        isPending={deleteType.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteType.mutate({ id: deleteTarget.id });
          }
        }}
        onCancel={() => setDeleteTarget(undefined)}
      />

      <Modal selector="modal-hook" show={deleteError !== undefined}>
        <div className="fixed inset-0 z-[69] flex items-center justify-center bg-slate-950/80 p-4">
          <div className="glass-card w-full max-w-lg p-5">
            <h3 className="text-xl font-bold text-white">
              Aktion nicht möglich
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
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Typen
          </p>
          <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {summary.total}
          </p>
        </div>
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Aktiv genutzt
          </p>
          <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {summary.withAssignments}
          </p>
        </div>
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Offene Seitenregeln
          </p>
          <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {summary.openEnded}
          </p>
        </div>
      </section>

      <section className="dashboard-card-grid grid gap-5">
        {items.map((item, index) => (
          <article
            key={item.id}
            className="glass-card-soft rise-in hover:bg-pirrot-blue-900/72 flex min-h-64 flex-col p-5 transition hover:-translate-y-1 hover:border-pirrot-blue-300/30 sm:min-h-72"
            style={{ animationDelay: `${index * 40}ms` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="badge-shell w-fit">Type</p>
                <h3 className="mt-3 line-clamp-2 text-xl font-black uppercase leading-tight text-white sm:text-2xl">
                  {item.name}
                </h3>
              </div>
              <ClipboardDocumentListIcon className="mt-1 size-6 text-pirrot-blue-200/70" />
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="field-shell p-4">
                <p className="compact-label text-[11px] uppercase text-pirrot-blue-200/65">
                  Module
                </p>
                <p className="mt-2 text-xl font-black text-white">
                  {item._count.modules}
                </p>
              </div>
              <div className="field-shell p-4">
                <p className="compact-label text-[11px] uppercase text-pirrot-blue-200/65">
                  Seitenregel
                </p>
                <p className="mt-2 text-sm font-semibold leading-snug text-white">
                  {getPageRules({ min: item.minPages, max: item.maxPages })}
                </p>
              </div>
            </div>

            <div className="mt-auto flex flex-col gap-3 pt-5 sm:flex-row">
              <button
                type="button"
                onClick={() =>
                  router.push(`/dashboard/types/manage?typeId=${item.id}`)
                }
                className="btn-secondary flex-1"
              >
                Bearbeiten
              </button>
              <button
                type="button"
                onClick={() => handleDeleteType(item)}
                className="btn-secondary px-3"
                aria-label={`${item.name} löschen`}
              >
                <TrashIcon className="size-5" />
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
