"use client";

import { useRef, useState } from "react";
import { FormMessage } from "@/components/form-message";
import { useFormAction } from "@/components/use-form-action";
import { uploadModule } from "../actions";

const KINDS = [
  { value: "umschlag", label: "Umschlag", rule: "Genau 4 Seiten (U1, U2, U3, U4). Platzhalter: BOOK_TITLE, BOOK_SUBTITLE, FROM_TO." },
  { value: "wochenplaner", label: "Wochen-Doppelseite", rule: "Genau 2 Seiten, wird für jede Woche wiederholt. Platzhalter: xA–xE, xA_Date–xE_Date, WEEK_FROMTO, WEEK_NUM." },
  { value: "inhalt", label: "Inhaltsseiten", rule: "1 bis 100 Seiten, werden unverändert übernommen (z. B. Stundenplan, Infoseiten, Notizen)." },
];

export function UploadForm() {
  const [kind, setKind] = useState("umschlag");
  const formRef = useRef<HTMLFormElement>(null);
  const { state, pending, onSubmit } = useFormAction(async (prev, formData) => {
    const result = await uploadModule(prev, formData);
    if (result?.ok) formRef.current?.reset();
    return result;
  });
  return (
    <form ref={formRef} onSubmit={onSubmit} className="card grid gap-4 md:grid-cols-2">
      <h2 className="text-lg md:col-span-2">PDF hochladen</h2>
      <label className="label">
        Art
        <select className="input" name="kind" value={kind} onChange={(event) => setKind(event.target.value)}>
          {KINDS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <span className="hint">{KINDS.find((option) => option.value === kind)?.rule}</span>
      </label>
      <label className="label">
        Name
        <input className="input" name="name" required maxLength={120} placeholder="z. B. Umschlag Sterne blau" />
      </label>
      <label className="label">
        PDF-Datei
        <input className="input" type="file" name="file" accept="application/pdf" required />
        <span className="hint">Druckfertig mit Beschnitt, max. 50 MB. Eine neue Version ist ein neues Modul.</span>
      </label>
      <label className="label">
        Beschreibung (optional)
        <input className="input" name="description" maxLength={300} />
      </label>
      {kind === "umschlag" && (
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" name="offer" defaultChecked /> Schulen dürfen diesen Umschlag auswählen
        </label>
      )}
      <div className="flex flex-col gap-3 md:col-span-2">
        <FormMessage state={state} />
        <div>
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? "Wird geprüft und hochgeladen …" : "Hochladen"}
          </button>
        </div>
      </div>
    </form>
  );
}
