"use client";

import { useState } from "react";
import type { Address } from "@/lib/address";
import { euro } from "@/lib/format";
import { quote, type PriceList } from "@/lib/pricing";
import { FormMessage } from "@/components/form-message";
import { useFormAction } from "@/components/use-form-action";
import { submitOrder } from "../actions";

type Defaults = {
  email: string;
  schoolName: string;
  phone: string;
  billing: Address | null;
  shipping: Address | null;
  separateShipping: boolean;
};

function AddressFields({ prefix, initial }: { prefix: "billing" | "shipping"; initial: Address | null }) {
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <label className="label sm:col-span-6">
        Name / Schule
        <input className="input" name={`${prefix}.name`} defaultValue={initial?.name} required autoComplete="organization" />
      </label>
      <label className="label sm:col-span-6">
        Zusatz
        <input className="input" name={`${prefix}.extra`} defaultValue={initial?.extra} placeholder="z. B. z. Hd. Sekretariat" />
      </label>
      <label className="label sm:col-span-6">
        Straße und Hausnummer
        <input className="input" name={`${prefix}.street`} defaultValue={initial?.street} required autoComplete="street-address" />
      </label>
      <label className="label sm:col-span-2">
        PLZ
        <input className="input" name={`${prefix}.zip`} defaultValue={initial?.zip} required autoComplete="postal-code" />
      </label>
      <label className="label sm:col-span-3">
        Ort
        <input className="input" name={`${prefix}.city`} defaultValue={initial?.city} required autoComplete="address-level2" />
      </label>
      <label className="label sm:col-span-1">
        Land
        <select className="input" name={`${prefix}.country`} defaultValue={initial?.country ?? "DE"}>
          <option value="DE">DE</option>
          <option value="AT">AT</option>
        </select>
      </label>
    </div>
  );
}

export function OrderForm({
  bookId,
  prices,
  defaults,
  legal,
  plannerSummary,
}: {
  bookId: string;
  plannerSummary: string;
  prices: PriceList;
  defaults: Defaults;
  legal: { label: string; href: string }[];
}) {
  const { state, pending, onSubmit } = useFormAction(submitOrder.bind(null, bookId));
  const [quantity, setQuantity] = useState(String(Math.max(prices.minQuantity, 1)));
  const [separateShipping, setSeparateShipping] = useState(defaults.separateShipping);
  const amounts = quote(Number(quantity), prices);
  const terms = legal.find((entry) => entry.label === "AGB");

  const [step, setStep] = useState(0);
  const [review, setReview] = useState<Record<string,string>>({});
  function next(form: HTMLFormElement) {
    const fields = form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`[data-step="${step}"] input, [data-step="${step}"] select`);
    for (const field of fields) if (!field.reportValidity()) return;
    setReview(Object.fromEntries(Array.from(new FormData(form)).map(([key,value])=>[key,String(value)])));
    setStep(step + 1); window.scrollTo({top:0,behavior:"smooth"});
  }
  return <div className={`planner-app checkout-app tone-${step}`}>
    <div className="wizard-top"><a href={`/planer/${bookId}`}>← Zur Gestaltung</a><span>BESTELLEN · {step+1} / 3</span></div>
    <nav className="wizard-progress" aria-label="Bestellfortschritt">{["Menge", "Adresse", "Alles klar?"].map((label,i)=><span key={label} className={i<=step?"active":""} aria-current={step===i?"step":undefined}><b>0{i+1}</b> {label}</span>)}</nav>
    <form noValidate onSubmit={event=>{if(step<2){event.preventDefault();next(event.currentTarget);}else onSubmit(event);}} className="checkout-stage">
      <div data-step="0" hidden={step!==0}>
        <p className="eyebrow">FÜR DIE GANZE SCHULE</p><h1>Wie viele<br/>dürfen’s sein?</h1><p className="checkout-intro">Ein Heft für jede gute Idee. Wählt eure Auflage.</p>
        <div className="quantity-picks">{[50,100,250,500].filter(n=>n>=prices.minQuantity).map(n=><button type="button" key={n} aria-pressed={quantity===String(n)} onClick={()=>setQuantity(String(n))}>{n}<span>Hefte</span></button>)}</div>
        <label className="label max-w-xs">Oder eure Wunschmenge<input className="input" name="quantity" type="number" min={prices.minQuantity} max={10000} required value={quantity} onChange={e=>setQuantity(e.target.value)}/><span className="hint">Ab {prices.minQuantity} Stück</span></label>
      </div>
      <div data-step="1" hidden={step!==1}>
        <p className="eyebrow">FAST BEI EUCH</p><h1>Wohin geht’s?</h1><p className="checkout-intro">Kontakt und Adresse für eure Lieferung.</p>
        <div className="grid gap-6 md:grid-cols-2">
          <section className="flex flex-col gap-4"><h2 className="text-xl">Eure Schule</h2>
            <label className="label">Schule<input className="input" name="schoolName" defaultValue={defaults.schoolName} required/></label>
            <label className="label">E-Mail für Bestätigung und Rechnung<input className="input" name="email" type="email" defaultValue={defaults.email} required/></label>
            <label className="label">Telefon (optional)<input className="input" name="phone" type="tel" defaultValue={defaults.phone}/></label>
            <label className="label">Anmerkung (optional)<textarea className="input" name="customerNote" maxLength={2000}/></label>
          </section>
          <section className="flex flex-col gap-4"><h2 className="text-xl">Rechnungsadresse</h2><AddressFields prefix="billing" initial={defaults.billing}/><label className="flex gap-2 items-center"><input type="checkbox" name="separateShipping" checked={separateShipping} onChange={e=>setSeparateShipping(e.target.checked)}/>Abweichende Lieferadresse</label>{separateShipping&&<><h2 className="text-xl">Lieferadresse</h2><AddressFields prefix="shipping" initial={defaults.shipping}/></>}</section>
        </div>
      </div>
      <div data-step="2" hidden={step!==2}>
        <p className="eyebrow">DAS WIRD EUER JAHR</p><h1>Bereit? Los!</h1><p className="checkout-intro">{quantity} Planer für eure Schule. Zahlung auf Rechnung.</p>
        <div className="review-banner"><strong>{plannerSummary}</strong><p>{review.schoolName} · {review.email}</p><p>Rechnung: {review["billing.name"]}, {review["billing.street"]}, {review["billing.zip"]} {review["billing.city"]}</p><p>Lieferung: {separateShipping ? `${review["shipping.name"]}, ${review["shipping.street"]}, ${review["shipping.zip"]} ${review["shipping.city"]}` : "An die Rechnungsadresse"}</p></div>
        <p className="mb-6 max-w-xl">Mit der Bestellung starten wir die Abwicklung. Bitte prüft euren Umschlag und eure Angaben vorher noch einmal.</p>
        <label className="flex gap-3 items-start mb-6"><input type="checkbox" name="acceptTerms" required className="mt-1"/><span>Ich akzeptiere die <a className="underline" target="_blank" rel="noreferrer" href={terms?.href}>AGB</a> und bestelle auf Rechnung.</span></label>
      </div>
      <div className="checkout-total">{amounts?<><span>{amounts.quantity} × {euro(amounts.unitAmount)}<small>Versand {amounts.shippingAmount===0?"kostenlos":euro(amounts.shippingAmount)}</small></span><strong>{euro(amounts.totalAmount)}<small>inkl. {(prices.vatBasisPoints/100).toLocaleString("de-DE")} % MwSt.</small></strong></>:<p>Bitte mindestens {prices.minQuantity} Stück bestellen.</p>}</div>
      <FormMessage state={state}/>
      <div className="wizard-bottom">{step>0?<button type="button" className="btn-secondary" onClick={()=>setStep(step-1)}>← Zurück</button>:<span/>}<button type="submit" className="btn-primary" disabled={!amounts||pending} onClick={e=>{if(step===2){const terms=e.currentTarget.form?.elements.namedItem("acceptTerms") as HTMLInputElement; if(!terms.reportValidity())e.preventDefault();}}}>{pending?"Bestellung wird gesendet …":step===2?"Zahlungspflichtig bestellen":"Weiter →"}</button></div>
    </form>
  </div>;
}
