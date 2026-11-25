"use client";

import { useState } from "react";
import { FormMessage } from "@/components/form-message";
import { useFormAction } from "@/components/use-form-action";
import { addTeamMember, savePrices } from "../actions";

type Prices = {
  tiers: { minQuantity: number; unitAmount: number }[];
  shippingAmount: number;
  freeShippingAt: number | null;
  minQuantity: number;
  vatBasisPoints: number;
  defaultPlanStart: string;
  defaultPlanEnd: string;
};

const euroInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

export function PriceForm({ initial }: { initial: Prices }) {
  const { state, pending, onSubmit } = useFormAction(savePrices);
  const [rows, setRows] = useState(Math.max(initial.tiers.length, 1));
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Preisstaffel (pro Planer, brutto)</p>
        {Array.from({ length: rows }, (_, index) => {
          const tier = initial.tiers[index];
          return (
            <div key={index} className="flex items-center gap-2 text-sm">
              <span className="w-6 text-muted">ab</span>
              <input className="input w-24" name="tierMin" inputMode="numeric" defaultValue={tier?.minQuantity ?? ""} />
              <span className="text-muted">Stück</span>
              <input className="input w-28" name="tierPrice" inputMode="decimal" defaultValue={tier ? euroInput(tier.unitAmount) : ""} />
              <span className="text-muted">€</span>
            </div>
          );
        })}
        <div>
          <button type="button" className="text-sm text-brand underline" onClick={() => setRows((count) => count + 1)}>
            + Staffel
          </button>
          <span className="hint ml-3">Leere Zeilen werden ignoriert.</span>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="label">
          Mindestmenge
          <input className="input" name="minQuantity" inputMode="numeric" defaultValue={initial.minQuantity} required />
        </label>
        <label className="label">
          Versand (€)
          <input className="input" name="shipping" inputMode="decimal" defaultValue={euroInput(initial.shippingAmount)} required />
        </label>
        <label className="label">
          Versandkostenfrei ab (Stück)
          <input className="input" name="freeShippingAt" inputMode="numeric" defaultValue={initial.freeShippingAt ?? ""} />
          <span className="hint">leer = nie</span>
        </label>
        <label className="label">
          MwSt. (%)
          <input className="input" name="vat" inputMode="decimal" defaultValue={(initial.vatBasisPoints / 100).toString().replace(".", ",")} required />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="label">
          Vorschlag Schuljahresbeginn
          <input className="input" type="date" name="defaultPlanStart" defaultValue={initial.defaultPlanStart} />
          <span className="hint">Nur Tag und Monat zählen; leer = 1. August.</span>
        </label>
        <label className="label">
          Vorschlag Schuljahresende
          <input className="input" type="date" name="defaultPlanEnd" defaultValue={initial.defaultPlanEnd} />
          <span className="hint">Nur Tag und Monat zählen; leer = 31. Juli.</span>
        </label>
      </div>
      <FormMessage state={state} />
      <div>
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? "…" : "Speichern"}</button>
      </div>
    </form>
  );
}

export function TeamForm() {
  const { state, pending, onSubmit } = useFormAction(addTeamMember);
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input className="input max-w-xs" type="email" name="email" placeholder="name@firma.de" required />
        <select className="input w-36" name="role" defaultValue="STAFF">
          <option value="STAFF">Mitarbeiter</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button type="submit" className="btn-secondary" disabled={pending}>Hinzufügen</button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
