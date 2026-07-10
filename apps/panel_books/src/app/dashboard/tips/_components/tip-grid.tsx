"use client";

import {
  ChatBubbleBottomCenterTextIcon,
  TrashIcon,
} from "@heroicons/react/16/solid";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import ConfirmDeleteDialog from "@/app/_components/confirm-delete-dialog";
import Modal from "@/app/_components/modal";
import { api } from "@/trpc/react";

export default function TipGrid() {
  const [items] = api.tip.getAll.useSuspenseQuery();
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<
    { id: number; title: string } | undefined
  >();
  const router = useRouter();
  const utils = api.useUtils();

  const deleteTip = api.tip.delete.useMutation({
    onSuccess: async () => {
      setDeleteTarget(undefined);
      await utils.tip.invalidate();
    },
    onError: (error) => {
      setDeleteTarget(undefined);
      setDeleteError(error.message);
    },
  });

  const summary = useMemo(
    () => ({
      total: items.length,
      longForm: items.filter((item) => item.tip.length > 120).length,
      shortForm: items.filter((item) => item.tip.length <= 120).length,
    }),
    [items],
  );

  return (
    <div className="flex flex-col gap-6">
      <ConfirmDeleteDialog
        show={deleteTarget !== undefined}
        message={`Der Tooltip „${deleteTarget?.title ?? ""}" wird endgültig gelöscht.`}
        isPending={deleteTip.isPending}
        onConfirm={() => {
          if (deleteTarget) {
            deleteTip.mutate({ id: deleteTarget.id });
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
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Tooltips
          </p>
          <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {summary.total}
          </p>
        </div>
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Kurztexte
          </p>
          <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {summary.shortForm}
          </p>
        </div>
        <div className="metric-card">
          <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
            Längere Hilfetexte
          </p>
          <p className="mt-4 text-3xl font-black text-white sm:text-4xl">
            {summary.longForm}
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
                <p className="badge-shell w-fit">Tooltip</p>
                <h3 className="mt-3 line-clamp-2 text-xl font-black leading-tight text-white sm:text-2xl">
                  {item.title}
                </h3>
              </div>
              <ChatBubbleBottomCenterTextIcon className="mt-1 size-6 text-pirrot-blue-200/70" />
            </div>

            <p className="text-pirrot-blue-100/78 mt-5 line-clamp-5 text-sm leading-6">
              {item.tip}
            </p>

            <div className="mt-auto flex flex-col gap-3 pt-5 sm:flex-row">
              <button
                type="button"
                onClick={() =>
                  router.push(`/dashboard/tips/manage?tipId=${item.id}`)
                }
                className="btn-secondary flex-1"
              >
                Bearbeiten
              </button>
              <button
                type="button"
                onClick={() =>
                  setDeleteTarget({ id: item.id, title: item.title })
                }
                className="btn-secondary px-3"
                aria-label={`${item.title} löschen`}
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
