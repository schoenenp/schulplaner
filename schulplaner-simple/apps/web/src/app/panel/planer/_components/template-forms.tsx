"use client";

import { FormMessage } from "@/components/form-message";
import { useFormAction } from "@/components/use-form-action";
import { addTemplateModule, saveTemplateInfo, setTemplateCover } from "../actions";

type Option = { id: string; name: string; detail?: string };

export function TemplateInfoForm({ bookTitle, format }: { bookTitle: string; format: string }) {
  const { state, pending, onSubmit } = useFormAction(saveTemplateInfo);
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
      <label className="label">
        Vorgeschlagener Titel
        <input className="input" name="bookTitle" defaultValue={bookTitle} maxLength={60} required />
        <span className="hint">Schulen sehen ihn als Vorschlag und können ihn ändern.</span>
      </label>
      <label className="label">
        Format
        <select className="input" name="format" defaultValue={format}>
          <option value="A5">DIN A5</option>
          <option value="A4">DIN A4</option>
        </select>
        <span className="hint">&nbsp;</span>
      </label>
      <div className="flex flex-col gap-2">
        <button type="submit" className="btn-secondary" disabled={pending}>Speichern</button>
        <span className="hint">&nbsp;</span>
      </div>
      <div className="sm:col-span-3"><FormMessage state={state} /></div>
    </form>
  );
}

export function CoverSelect({ current, options }: { current?: string; options: Option[] }) {
  const { state, pending, onSubmit } = useFormAction(setTemplateCover);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <select className="input max-w-sm" name="moduleId" defaultValue={current ?? ""} required>
          <option value="" disabled>Umschlag wählen …</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.name}</option>
          ))}
        </select>
        <button type="submit" className="btn-secondary" disabled={pending}>Als Standard setzen</button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function AddModuleForm({ options }: { options: Option[] }) {
  const { state, pending, onSubmit } = useFormAction(addTemplateModule);
  if (options.length === 0) {
    return <p className="text-sm text-muted">Alle Inhaltsmodule sind bereits enthalten. Neue Module laden Sie unter „Module & Umschläge“ hoch.</p>;
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <select className="input max-w-sm" name="moduleId" defaultValue="" required>
          <option value="" disabled>Modul hinzufügen …</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}{option.detail ? ` (${option.detail})` : ""}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-secondary" disabled={pending}>Hinzufügen</button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
