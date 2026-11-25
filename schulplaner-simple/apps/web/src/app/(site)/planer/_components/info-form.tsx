"use client";

import { useWizardNext } from "./planner-wizard";
import { AUSTRIAN_STATES, GERMAN_STATES } from "@/lib/regions";
import { FormMessage } from "@/components/form-message";
import { useFormAction } from "@/components/use-form-action";
import { savePlannerInfo } from "../actions";

type Initial = {
  bookTitle: string;
  subTitle: string;
  region: string;
  planStart: string;
  planEnd: string;
};

export function InfoForm({ bookId, initial }: { bookId: string; initial: Initial }) {
  const next = useWizardNext();
  const { state, pending, onSubmit } = useFormAction(async (prev, data) => {
    const result = await savePlannerInfo(bookId, prev, data);
    if (result?.ok) next?.();
    return result;
  });
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className="label sm:col-span-2">
        Titel
        <input className="input" name="bookTitle" defaultValue={initial.bookTitle} maxLength={60} required />
        <span className="hint">z. B. „Mein Schuljahr“ oder „Hausaufgabenheft“</span>
      </label>
      <label className="label sm:col-span-2">
        Untertitel
        <input className="input" name="subTitle" defaultValue={initial.subTitle} maxLength={80} />
        <span className="hint">z. B. der Name Ihrer Schule (optional)</span>
      </label>
      <label className="label">
        Erster Tag
        <input className="input" type="date" name="planStart" defaultValue={initial.planStart} required />
      </label>
      <label className="label">
        Letzter Tag
        <input className="input" type="date" name="planEnd" defaultValue={initial.planEnd} required />
      </label>
      <label className="label sm:col-span-2">
        Bundesland (für Ferien und Feiertage)
        <select className="input" name="region" defaultValue={initial.region} required>
          <optgroup label="Deutschland">
            {GERMAN_STATES.map((state) => (
              <option key={state.code} value={state.code}>
                {state.land}
              </option>
            ))}
          </optgroup>
          <optgroup label="Österreich">
            {AUSTRIAN_STATES.map((state) => (
              <option key={state.code} value={state.code}>
                {state.land}
              </option>
            ))}
          </optgroup>
        </select>
      </label>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <FormMessage state={state} />
        <div>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Wird gespeichert …" : "Speichern & weiter →"}
          </button>
        </div>
      </div>
    </form>
  );
}
