"use client";

import { TrashIcon } from "@heroicons/react/16/solid";

import Modal from "@/app/_components/modal";

type ConfirmDeleteDialogProps = {
  show: boolean;
  message: string;
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDeleteDialog({
  show,
  message,
  isPending,
  onConfirm,
  onCancel,
}: ConfirmDeleteDialogProps) {
  return (
    <Modal selector="modal-hook" show={show}>
      <div className="fixed inset-0 z-[69] flex items-center justify-center bg-slate-950/80 p-4">
        <div className="glass-card w-full max-w-lg p-5">
          <h3 className="text-xl font-bold text-white">Bist du sicher?</h3>
          <p className="mt-2 text-sm text-pirrot-blue-100/75">{message}</p>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Abbrechen
            </button>
            <button
              type="button"
              className="btn-primary gap-2"
              disabled={isPending}
              onClick={onConfirm}
            >
              <TrashIcon className="size-4" />
              {isPending ? "Löscht …" : "Ja, löschen"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
