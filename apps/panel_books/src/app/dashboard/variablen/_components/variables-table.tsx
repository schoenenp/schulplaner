"use client";

import { ArrowUturnLeftIcon, TrashIcon } from "@heroicons/react/16/solid";
import type { TagStatus, TagType } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import ConfirmDeleteDialog from "@/app/_components/confirm-delete-dialog";
import Modal from "@/app/_components/modal";
import { api } from "@/trpc/react";
import { formatDate } from "@/util/format";
import CreateOrUpdateTag from "./create-or-update-tag";

type VarsTableProps = {
  items: TableItem[];
};

type DeleteTarget = {
  item: TableItem;
  mode: "soft" | "hard";
};

export default function VarsTable(props: VarsTableProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | undefined>();

  const items = props.items.filter((item) => !item.deletedAt);
  const deletedItems = props.items.filter((item) => item.deletedAt);

  async function refresh() {
    await utils.tag.invalidate();
    router.refresh();
  }

  const softDeleteTag = api.tag.softDelete.useMutation({
    onSuccess: async () => {
      setDeleteTarget(undefined);
      await refresh();
    },
    onError: (error) => {
      setDeleteTarget(undefined);
      setDeleteError(error.message);
    },
  });

  const hardDeleteTag = api.tag.hardDelete.useMutation({
    onSuccess: async () => {
      setDeleteTarget(undefined);
      await refresh();
    },
    onError: (error) => {
      setDeleteTarget(undefined);
      setDeleteError(error.message);
    },
  });

  const restoreTag = api.tag.restore.useMutation({
    onSuccess: refresh,
    onError: (error) => setDeleteError(error.message),
  });

  const summary = {
    total: items.length,
    released: items.filter((item) => item.status === "RELEASED").length,
    beta: items.filter((item) => item.status === "BETA").length,
    unreleased: items.filter((item) => item.status === "UNRELEASED").length,
  };

  return (
    <div className="flex w-full flex-col gap-6">
      <ConfirmDeleteDialog
        show={deleteTarget !== undefined}
        message={
          deleteTarget?.mode === "hard"
            ? `Die Variable „${deleteTarget.item.name}" wird endgültig gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`
            : `Die Variable „${deleteTarget?.item.name ?? ""}" wird gelöscht und kann im Bereich „Gelöschte Variablen" wiederhergestellt werden.`
        }
        isPending={softDeleteTag.isPending || hardDeleteTag.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          if (deleteTarget.mode === "hard") {
            hardDeleteTag.mutate({ id: deleteTarget.item.id });
          } else {
            softDeleteTag.mutate({ id: deleteTarget.item.id });
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
        <MetricCard label="Variablen" value={summary.total} />
        <MetricCard label="Live" value={summary.released} />
        <MetricCard label="Beta" value={summary.beta} />
        <MetricCard label="Intern" value={summary.unreleased} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <div className="glass-card-soft overflow-hidden">
          <div className="border-b border-pirrot-blue-200/10 px-4 py-4 sm:px-5">
            <p className="compact-label text-xs font-semibold uppercase text-pirrot-blue-200/70">
              Bibliothek
            </p>
            <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">
              Variablenübersicht
            </h3>
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full">
              <thead className="bg-pirrot-blue-950/55">
                <tr className="compact-label text-left text-xs uppercase text-pirrot-blue-200/70">
                  <th className="px-5 py-4">Id</th>
                  <th className="px-5 py-4">Name</th>
                  <th className="px-5 py-4">Beschreibung</th>
                  <th className="px-5 py-4 text-center">Status</th>
                  <th className="px-5 py-4 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                    item={item}
                    onDelete={() => setDeleteTarget({ item, mode: "soft" })}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 p-4 lg:hidden">
            {items.map((item) => (
              <MobileCard
                key={item.id}
                item={item}
                onDelete={() => setDeleteTarget({ item, mode: "soft" })}
              />
            ))}
          </div>
        </div>

        <div className="glass-card-soft p-5">
          <p className="compact-label text-xs font-semibold uppercase text-pirrot-blue-200/70">
            Editor
          </p>
          <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">
            Neue Variable
          </h3>
          <p className="text-pirrot-blue-100/72 mt-3 text-sm leading-6">
            Legen Sie neue Tags direkt neben der Liste an, damit redaktionelle
            Pflege auch auf Tablets oder kleineren Notebooks ohne Kontextwechsel
            funktioniert.
          </p>
          <div className="mt-5">
            <CreateOrUpdateTag />
          </div>
        </div>
      </section>

      {deletedItems.length > 0 && (
        <section className="glass-card-soft overflow-hidden">
          <div className="border-b border-pirrot-blue-200/10 px-4 py-4 sm:px-5">
            <p className="compact-label text-xs font-semibold uppercase text-pirrot-blue-200/70">
              Archiv
            </p>
            <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">
              Gelöschte Variablen
            </h3>
            <p className="text-pirrot-blue-100/72 mt-2 text-sm leading-6">
              Gelöschte Einträge können wiederhergestellt oder endgültig
              entfernt werden.
            </p>
          </div>
          <div className="flex flex-col gap-3 p-4">
            {deletedItems.map((item) => (
              <div key={item.id} className="field-shell p-4 opacity-60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="compact-label text-xs uppercase text-pirrot-blue-200/70">
                      #{item.id}
                      {item.deletedAt
                        ? ` · gelöscht am ${formatDate(item.deletedAt)}`
                        : ""}
                    </p>
                    <h4 className="mt-2 break-words text-lg font-black text-white">
                      {item.name}
                    </h4>
                    <p className="text-pirrot-blue-100/72 mt-2 text-sm leading-6">
                      {item.desc?.trim() ? item.desc : "Keine Beschreibung."}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className="btn-secondary gap-1.5 px-3 py-1.5 text-xs"
                      disabled={restoreTag.isPending}
                      onClick={() => restoreTag.mutate({ id: item.id })}
                    >
                      <ArrowUturnLeftIcon className="size-3.5" />
                      Wiederherstellen
                    </button>
                    <button
                      type="button"
                      className="btn-secondary px-3 py-1.5 text-xs"
                      onClick={() => setDeleteTarget({ item, mode: "hard" })}
                      aria-label={`${item.name} endgültig löschen`}
                      title="Endgültig löschen"
                    >
                      <TrashIcon className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type TableItem = {
  id: number;
  name: string;
  desc: string | null;
  output: string | null;
  type: TagType;
  status: TagStatus;
  deletedAt: Date | null;
};

type RowProps = {
  item: TableItem;
  onDelete: () => void;
};

function toFormInputs(item: TableItem) {
  return {
    id: item.id,
    name: item.name,
    desc: item.desc ?? "",
    output: item.output ?? "",
    type: item.type,
    status: item.status,
    allowedIn: [],
  };
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <p className="compact-label text-sm uppercase text-pirrot-blue-200/70">
        {label}
      </p>
      <p className="mt-4 text-3xl font-black text-white sm:text-4xl">{value}</p>
    </div>
  );
}

function TableRow({ item, onDelete }: RowProps) {
  return (
    <tr className="border-t border-pirrot-blue-200/10 text-sm text-pirrot-blue-50 transition hover:bg-pirrot-blue-900/45">
      <td className="px-5 py-4 align-top">{item.id}</td>
      <td className="break-words px-5 py-4 align-top font-semibold">
        {item.name}
      </td>
      <td className="text-pirrot-blue-100/72 break-words px-5 py-4 align-top">
        {item.desc?.trim() ? item.desc : "Keine Beschreibung."}
      </td>
      <td className="px-5 py-4 text-center align-top">
        <StatusBadge status={item.status} />
      </td>
      <td className="px-5 py-4 align-top">
        <div className="flex justify-end gap-2">
          <CreateOrUpdateTag existingTag={toFormInputs(item)} />
          <button
            type="button"
            onClick={onDelete}
            className="btn-secondary px-2 py-2"
            aria-label={`${item.name} löschen`}
          >
            <TrashIcon className="size-5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function MobileCard({ item, onDelete }: RowProps) {
  return (
    <div className="field-shell p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="compact-label text-xs uppercase text-pirrot-blue-200/70">
            #{item.id}
          </p>
          <h4 className="mt-2 break-words text-lg font-black text-white">
            {item.name}
          </h4>
        </div>
        <StatusBadge status={item.status} />
      </div>
      <p className="text-pirrot-blue-100/72 mt-3 text-sm leading-6">
        {item.desc?.trim() ? item.desc : "Keine Beschreibung."}
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <CreateOrUpdateTag existingTag={toFormInputs(item)} />
        <button
          type="button"
          onClick={onDelete}
          className="btn-secondary px-2 py-2"
          aria-label={`${item.name} löschen`}
        >
          <TrashIcon className="size-5" />
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TagStatus }) {
  const styleMap: Record<TagStatus, string> = {
    RELEASED: "border-success-400/30 bg-success-950/35 text-success-200",
    BETA: "border-warning-400/30 bg-warning-950/35 text-warning-200",
    UNRELEASED:
      "border-pirrot-red-400/30 bg-pirrot-red-950/35 text-pirrot-red-200",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] ${styleMap[status]}`}
    >
      {status}
    </span>
  );
}
