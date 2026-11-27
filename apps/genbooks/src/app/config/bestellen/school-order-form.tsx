"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText } from "lucide-react";
import {
  formatSchoolOrderPrice,
  MAX_SCHOOL_ORDER_QUANTITY,
  schoolOrderAddressLines,
  type SchoolOrderAddress,
} from "@/util/school-order-input";
import { placeSchoolOrder, reviewSchoolOrder } from "./actions";

type SchoolOrderFormProps = {
  bookId: string;
  preview: string;
  initialQuantity: number;
  schoolName: string;
  contactName: string;
  email: string;
  country: "DE" | "AT";
  plannerSummary: {
    title: string;
    cover: string;
    period: string;
    format: string;
    binding: string;
  };
};

type Review = NonNullable<
  Awaited<ReturnType<typeof reviewSchoolOrder>>["review"]
>;

const fieldClass = "field-shell w-full px-3 py-2.5 font-normal";

function TextField({
  label,
  name,
  type = "text",
  initial,
  autoComplete,
  required = true,
  maxLength = 160,
  className,
}: {
  label: string;
  name: string;
  type?: "text" | "email" | "tel";
  initial?: string;
  autoComplete?: string;
  required?: boolean;
  maxLength?: number;
  className?: string;
}) {
  return (
    <label
      className={`flex flex-col gap-1.5 text-sm font-semibold ${className ?? ""}`}
    >
      {label}
      <input
        className={fieldClass}
        name={name}
        type={type}
        defaultValue={initial}
        autoComplete={autoComplete}
        required={required}
        maxLength={maxLength}
      />
    </label>
  );
}

function AddressFields({
  prefix,
  country,
  recipient,
}: {
  prefix: "billing" | "shipping";
  country: "DE" | "AT";
  recipient?: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField
        label="Empfänger / Schule"
        name={`${prefix}.recipient`}
        initial={recipient}
        autoComplete={`${prefix} organization`}
        className="sm:col-span-2"
      />
      <TextField
        label="Adresszusatz (optional)"
        name={`${prefix}.extra`}
        required={false}
        className="sm:col-span-2"
      />
      <TextField
        label="Straße und Hausnummer"
        name={`${prefix}.street`}
        autoComplete={`${prefix} street-address`}
        className="sm:col-span-2"
      />
      <TextField
        label="Postleitzahl"
        name={`${prefix}.zip`}
        autoComplete={`${prefix} postal-code`}
        maxLength={16}
      />
      <TextField
        label="Ort"
        name={`${prefix}.city`}
        autoComplete={`${prefix} address-level2`}
        maxLength={120}
      />
      <label className="flex flex-col gap-1.5 text-sm font-semibold sm:col-span-2">
        Land
        <select
          name={`${prefix}.country`}
          autoComplete={`${prefix} country`}
          className={fieldClass}
          defaultValue={country}
        >
          <option value="DE">Deutschland</option>
          <option value="AT">Österreich</option>
        </select>
      </label>
    </div>
  );
}

function AddressSummary({
  title,
  address,
}: {
  title: string;
  address: SchoolOrderAddress;
}) {
  return (
    <div>
      <h3 className="font-bold">{title}</h3>
      {schoolOrderAddressLines(address).map((line, index) => (
        <p key={index} className="text-sm">
          {line}
        </p>
      ))}
    </div>
  );
}

export default function SchoolOrderForm(props: SchoolOrderFormProps) {
  const {
    bookId,
    preview,
    initialQuantity,
    schoolName,
    contactName,
    email,
    country,
    plannerSummary,
  } = props;
  const [quantity, setQuantity] = useState(
    String(Math.max(1, Math.min(initialQuantity, MAX_SCHOOL_ORDER_QUANTITY))),
  );
  const [separateShipping, setSeparateShipping] = useState(false);
  const [review, setReview] = useState<Review>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [completed, setCompleted] = useState(false);
  const router = useRouter();

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_18rem]">
      <div>
        <form
          hidden={Boolean(review)}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            setError(undefined);
            startTransition(async () => {
              try {
                const result = await reviewSchoolOrder(bookId, preview, data);
                setError(result.error);
                if (result.review) {
                  setReview(result.review);
                  scrollToTop();
                }
              } catch {
                setError(
                  "Die Bestelldaten konnten nicht geprüft werden. Bitte versuchen Sie es erneut.",
                );
              }
            });
          }}
        >
          <fieldset
            className="content-card flex flex-col gap-5 p-5 sm:p-6"
            disabled={pending}
          >
            <div>
              <h2 className="mb-3 text-xl font-bold">Auflage</h2>
              <div
                className="mb-3 flex flex-wrap gap-2"
                aria-label="Vorgeschlagene Stückzahlen"
              >
                {[50, 100, 250, 500].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    className={`px-3 py-2 ${quantity === String(amount) ? "btn-solid" : "btn-soft"}`}
                    aria-pressed={quantity === String(amount)}
                    onClick={() => setQuantity(String(amount))}
                  >
                    {amount} Stück
                  </button>
                ))}
              </div>
              <label className="flex max-w-56 flex-col gap-1.5 text-sm font-semibold">
                Stückzahl
                <input
                  className={fieldClass}
                  name="quantity"
                  type="number"
                  min={1}
                  max={MAX_SCHOOL_ORDER_QUANTITY}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                />
              </label>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <section className="flex flex-col gap-3">
                <h2 className="text-xl font-bold">Ihre Schule</h2>
                <TextField
                  label="Name der Schule"
                  name="schoolName"
                  initial={schoolName}
                  autoComplete="organization"
                />
                <TextField
                  label="Ansprechperson"
                  name="contactName"
                  initial={contactName}
                  autoComplete="name"
                />
                <TextField
                  label="E-Mail für Bestätigung und Rechnung"
                  name="email"
                  initial={email}
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                />
                <TextField
                  label="Telefon (optional)"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  required={false}
                  maxLength={40}
                />
                <label className="flex flex-col gap-1.5 text-sm font-semibold">
                  Anmerkung (optional)
                  <textarea
                    className={fieldClass}
                    name="customerNote"
                    maxLength={2000}
                    rows={3}
                  />
                </label>
              </section>
              <section className="flex flex-col gap-3">
                <h2 className="text-xl font-bold">Rechnungsadresse</h2>
                <AddressFields
                  prefix="billing"
                  country={country}
                  recipient={schoolName}
                />
                <label className="flex items-center gap-2 py-1 text-sm font-semibold">
                  <input
                    type="checkbox"
                    name="separateShipping"
                    checked={separateShipping}
                    onChange={(event) =>
                      setSeparateShipping(event.target.checked)
                    }
                  />
                  Abweichende Lieferadresse
                </label>
                <fieldset
                  className="min-w-0"
                  hidden={!separateShipping}
                  disabled={!separateShipping}
                >
                  <legend className="mb-3 text-xl font-bold">
                    Lieferadresse
                  </legend>
                  <AddressFields prefix="shipping" country={country} />
                </fieldset>
              </section>
            </div>
            {!review && error ? (
              <p
                role="alert"
                className="text-pirrot-red-700 text-sm font-semibold"
              >
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              className="btn-solid flex w-fit items-center gap-2 px-4 py-2.5"
            >
              {pending ? "Preis wird berechnet …" : "Bestellung prüfen"}{" "}
              <ArrowRight size={18} />
            </button>
          </fieldset>
        </form>

        {review ? (
          <form
            className="content-card flex flex-col gap-5 p-5 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              setError(undefined);
              startTransition(async () => {
                try {
                  const result = await placeSchoolOrder(review.token, data);
                  if (result.destination) {
                    setCompleted(true);
                    router.push(result.destination);
                  } else {
                    setError(result.error);
                  }
                } catch {
                  setError(
                    "Die Bestellung konnte nicht bestätigt werden. Bitte versuchen Sie es erneut.",
                  );
                }
              });
            }}
          >
            <h2 className="text-xl font-bold">Bestellung prüfen</h2>
            <div>
              <h3 className="font-bold">{review.input.schoolName}</h3>
              <p className="text-sm">
                {review.input.contactName} · {review.input.email}
              </p>
              {review.input.phone ? (
                <p className="text-sm">{review.input.phone}</p>
              ) : null}
              {review.input.customerNote ? (
                <p className="mt-2 text-sm whitespace-pre-wrap">
                  {review.input.customerNote}
                </p>
              ) : null}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <AddressSummary
                title="Rechnungsadresse"
                address={review.input.billingAddress}
              />
              <AddressSummary
                title="Lieferadresse"
                address={review.input.shippingAddress}
              />
            </div>
            <dl className="border-pirrot-blue-200 grid grid-cols-[1fr_auto] gap-x-5 gap-y-2 border-y py-4 text-sm">
              <dt>
                {review.input.quantity} Schulplaner mit je{" "}
                {review.fullPageCount} Seiten
              </dt>
              <dd>{formatSchoolOrderPrice(review.amounts.product)}</dd>
              <dt>Standardversand</dt>
              <dd>{formatSchoolOrderPrice(review.amounts.shipping)}</dd>
              <dt className="font-bold">Gesamt inkl. MwSt.</dt>
              <dd className="font-bold">
                {formatSchoolOrderPrice(review.amounts.total)}
              </dd>
            </dl>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="confirmed"
                required
                className="mt-0.5"
              />
              <span>
                Ich habe die Bestelldaten geprüft und bestelle auf Rechnung. Die{" "}
                <a
                  className="underline"
                  href="https://secure.pirrot.de/datenschutz"
                  target="_blank"
                  rel="noreferrer"
                >
                  Datenschutzhinweise
                </a>{" "}
                habe ich zur Kenntnis genommen.
              </span>
            </label>
            {error ? (
              <p
                role="alert"
                className="text-pirrot-red-700 text-sm font-semibold"
              >
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn-soft px-4 py-2.5"
                disabled={pending || completed}
                onClick={() => {
                  setReview(undefined);
                  setError(undefined);
                  scrollToTop();
                }}
              >
                Angaben ändern
              </button>
              <button
                type="submit"
                className="btn-solid px-4 py-2.5"
                disabled={pending || completed}
              >
                {pending || completed
                  ? "Bestellung wird gesendet …"
                  : "Zahlungspflichtig bestellen"}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      <aside className="content-card row-start-1 p-5 lg:col-start-2">
        <FileText
          aria-hidden="true"
          className="text-pirrot-blue-700 mb-3"
          size={24}
        />
        <h2 className="font-bold">{plannerSummary.title}</h2>
        <p className="text-info-700 mt-1 text-sm">{plannerSummary.period}</p>
        {plannerSummary.cover ? (
          <p className="text-info-700 mt-1 text-sm">{plannerSummary.cover}</p>
        ) : null}
        <p className="text-info-700 mt-3 text-sm">
          {[plannerSummary.format, plannerSummary.binding]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </aside>
    </div>
  );
}
