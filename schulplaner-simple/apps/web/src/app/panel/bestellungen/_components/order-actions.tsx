"use client";

import type { OrderStatus } from "db";
import { useFormAction } from "@/components/use-form-action";
import { FormMessage } from "@/components/form-message";
import { NEXT_STEP_LABEL } from "@/lib/order-status";
import { advanceOrder, generatePrintFile, saveBilling } from "../actions";

export function AdvanceForm({ orderId, status }: { orderId: number; status: OrderStatus }) {
  const { state, pending, onSubmit } = useFormAction(advanceOrder.bind(null, orderId));
  const label = NEXT_STEP_LABEL[status];
  if (!label) return <FormMessage state={state} />;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {status === "IN_PRODUCTION" && (
        <label className="label">
          Sendungsnummer (optional)
          <input className="input" name="trackingNumber" maxLength={100} />
          <span className="hint">Die Schule erhält beim Versand eine E-Mail mit der Nummer.</span>
        </label>
      )}
      <div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "…" : label}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function PrintFileForm({ orderId, hasFile }: { orderId: number; hasFile: boolean }) {
  const { state, pending, onSubmit } = useFormAction((prev) => generatePrintFile(orderId, prev));
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div>
        <button type="submit" className={hasFile ? "btn-secondary" : "btn-primary"} disabled={pending}>
          {pending ? "Druckdatei wird erstellt …" : hasFile ? "Neu erstellen" : "Druckdatei erstellen"}
        </button>
      </div>
      {pending && <p className="hint">Der komplette Planer wird gebaut – das kann bis zu einer Minute dauern.</p>}
      <FormMessage state={state} />
    </form>
  );
}

export function BillingForm({
  orderId,
  invoiceNumber,
  paid,
  internalNote,
}: {
  orderId: number;
  invoiceNumber: string | null;
  paid: boolean;
  internalNote: string | null;
}) {
  const { state, pending, onSubmit } = useFormAction(saveBilling.bind(null, orderId));
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label className="label">
        Rechnungsnummer
        <input className="input" name="invoiceNumber" defaultValue={invoiceNumber ?? ""} maxLength={60} />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="paid" defaultChecked={paid} /> Bezahlt
      </label>
      <label className="label">
        Interne Notiz
        <textarea className="input min-h-20" name="internalNote" defaultValue={internalNote ?? ""} maxLength={5000} />
        <span className="hint">Nur im Panel sichtbar.</span>
      </label>
      <div>
        <button type="submit" className="btn-secondary" disabled={pending}>
          {pending ? "…" : "Speichern"}
        </button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
