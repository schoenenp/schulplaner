"use client";

import { useEffect, useId, useRef } from "react";
import { XIcon } from "lucide-react";
import ModulePreview from "./module-preview";

/** Mount while open so the browser restores focus to the preview trigger. */
export default function ModulePreviewDialog({
  moduleId,
  title,
  onClose,
}: {
  moduleId: string;
  title: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          onClose();
        }
      }}
      className="border-pirrot-blue-200 bg-info-50 text-pirrot-blue-950 backdrop:bg-info-950/90 fixed inset-0 m-auto h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[96rem] overflow-hidden rounded-2xl border p-0 shadow-2xl open:flex open:flex-col max-md:h-dvh max-md:max-h-dvh max-md:w-full max-md:max-w-none max-md:rounded-none max-md:border-0"
    >
      <header className="border-info-200 flex shrink-0 items-center justify-between gap-3 border-b bg-white p-3 sm:p-4">
        <h3 id={titleId} className="min-w-0 truncate text-xl font-bold">
          {title}
        </h3>
        <button
          onClick={onClose}
          type="button"
          autoFocus
          className="btn-soft text-pirrot-blue-900 flex min-h-11 shrink-0 items-center justify-center gap-2 px-3 py-2"
          aria-label="Vorschau schließen"
        >
          <XIcon className="size-5" />
          <span>Schließen</span>
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden p-2 sm:p-4">
        <ModulePreview
          moduleId={moduleId}
          className="h-full min-h-0"
          sizes="(max-width: 1536px) 100vw, 1536px"
        />
      </div>
    </dialog>
  );
}
