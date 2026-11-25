"use client";

import { useEffect, useRef } from "react";
import { FormMessage } from "@/components/form-message";
import { useFormAction } from "@/components/use-form-action";
import { addCustomDate } from "../actions";

export function DateForm({ bookId }: { bookId: string }) {
  const { state, pending, onSubmit } = useFormAction(addCustomDate.bind(null, bookId));
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
        <label className="label">
          Datum
          <input className="input" type="date" name="date" required />
        </label>
        <label className="label">
          Bezeichnung
          <input className="input" name="name" maxLength={40} required placeholder="z. B. Elternsprechtag" />
        </label>
        <button type="submit" className="btn-secondary" disabled={pending}>
          {pending ? "…" : "Termin hinzufügen"}
        </button>
      </div>
      {state?.error && <FormMessage state={state} />}
    </form>
  );
}
