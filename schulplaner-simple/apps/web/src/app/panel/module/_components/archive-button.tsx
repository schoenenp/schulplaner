"use client";

import { useFormAction } from "@/components/use-form-action";
import { archiveModule } from "../actions";

export function ArchiveButton({ moduleId }: { moduleId: string }) {
  const { state, pending, onSubmit } = useFormAction(() => archiveModule(moduleId));
  return (
    <form
      onSubmit={(event) => {
        if (!window.confirm("Modul archivieren? Bestehende Bestellungen drucken es weiterhin.")) {
          event.preventDefault();
          return;
        }
        onSubmit(event);
      }}
      className="flex flex-col gap-1"
    >
      <button type="submit" className="text-xs text-muted hover:text-red-700" disabled={pending}>
        Archivieren
      </button>
      {state?.error && <span className="text-xs text-red-700">{state.error}</span>}
    </form>
  );
}
