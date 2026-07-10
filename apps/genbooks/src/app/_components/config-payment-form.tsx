"use client";
import { useState, useCallback } from "react";
import { CircleQuestionMark, Coins, XIcon } from "lucide-react";
import { api } from "@/trpc/react";
import { AddressForm } from "./address-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LoadingSpinner from "./loading-spinner";
import { getRetryAfterSeconds } from "@/util/trpc-error";

export type OrderAddress = {
  org: string;
  title: string;
  name: string;
  prename: string;
  street: string;
  streetNr: string;
  city: string;
  zip: string;
  email: string;
  optional?: string;
  phone?: string;
};

export default function ConfigOrderForm({
  bookId,
  initialFormState,
  onAbortForm,
  quantity,
  format,
  partnerToken,
}: {
  bookId: string;
  initialFormState?: OrderAddress;
  onAbortForm: () => void;
  quantity: number;
  format: string;
  partnerToken?: string;
}) {
  const [orderFormAddress, setOrderFormAddress] = useState<OrderAddress>(
    initialFormState ?? ({} as OrderAddress),
  );
  const router = useRouter();
  const [formError, setFormError] = useState<string | undefined>();
  const [isPickup, setIsPickup] = useState(false);
  const [saveUser, setSaveUser] = useState(false);

  const orderObject = {
    orderAddress: orderFormAddress,
    details: {
      bookId,
      quantity,
      isPickup,
      saveUser,
      format: format as "DIN A4" | "DIN A5",
      partnerToken,
    },
  };

  const updateBilling = useCallback(
    (patch: Partial<OrderAddress>) =>
      setOrderFormAddress((prev) => ({ ...prev, ...patch })),
    [],
  );

  const isOrderFormStateValid =
    !!orderFormAddress.prename &&
    !!orderFormAddress.name &&
    !!orderFormAddress.street &&
    !!orderFormAddress.streetNr &&
    !!orderFormAddress.city &&
    !!orderFormAddress.zip &&
    !!orderFormAddress.email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(orderFormAddress.email);

  const utils = api.useUtils();
  const setupBookOrder = api.config.setupOrder.useMutation({
    onSuccess: async (data) => {
      await utils.book.invalidate();
      await utils.config.invalidate();
      if (data.checkout_session) {
        router.push(data.checkout_session);
      } else if (data.redirect_url) {
        router.push(data.redirect_url);
      } else {
        setFormError("Fehler beim Erstellen der Zahlung");
      }
    },
    onError: (err) => {
      const retryAfterSeconds = getRetryAfterSeconds(err);
      if (retryAfterSeconds) {
        setFormError(
          `Zu viele Anfragen. Bitte warten Sie etwa ${retryAfterSeconds} Sekunden und versuchen Sie es erneut.`,
        );
        return;
      }
      const message = err.message?.trim();
      setFormError(
        message === "UNAUTHORIZED"
          ? `${message} —  Bitte loggen Sie sich ein um den Planer zu verwalten.`
          : `${message || "Die Bestellung konnte nicht vorbereitet werden."} — Formular Error, versuchen Sie es später erneut.`,
      );
    },
  });

  const handleSaveConfigOrder = () => {
    setupBookOrder.mutate(orderObject);
  };

  const handleOrderCancel = () => onAbortForm();

  if (setupBookOrder.isPending) {
    return (
      <div className="flex items-center justify-center p-4 pt-5 pb-6">
        <LoadingSpinner />
      </div>
    );
  }

  if (formError)
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-4 pt-5 pb-6 md:gap-4 lg:gap-8">
        <div className="flex w-full justify-between">
          <h1 className="text-pirrot-red-400 text-2xl font-bold">::Error::</h1>
        </div>
        <p>{formError}</p>
        <button
          className="btn-soft cursor-pointer rounded px-3 py-1 uppercase"
          type="button"
          onClick={() => setFormError(undefined)}
        >
          Ok
        </button>
      </div>
    );

  return (
    <div className="flex flex-col flex-wrap gap-2 lg:flex-row">
      {/* left column */}
      <div className="flex w-full flex-col gap-2 p-4 lg:max-w-xs">
        <div className="aspect-video w-full p-1">
          <h3 className="font-bold">Ihre Adressen</h3>
          <p className="mb-2">
            Die Rechnungsadresse wird standardmäßig als Lieferadresse genutzt.
            Falls abweichend, geben Sie bitte eine separate Lieferadresse an.
          </p>
        </div>

        <div className="field-shell aspect-video w-full p-2">
          <h3 className="font-bold">Rechnungsadresse</h3>
          <p className="text-sm">
            <b>{orderFormAddress.org}</b>
            <br />
            {orderFormAddress.title ?? ""} {orderFormAddress.prename}{" "}
            {orderFormAddress.name}
            <br />
            {orderFormAddress.street} {orderFormAddress.streetNr}
            <br />
            {orderFormAddress.zip} {orderFormAddress.city}
            <br />
            {orderFormAddress.optional}
          </p>
        </div>
      </div>

      {/* right column – forms */}

      <AddressForm
        state={orderFormAddress}
        setter={(patch) => updateBilling(patch)}
        title="Rechnungsadresse"
      />

      <div className="field-shell text-info-950 relative flex w-full items-center gap-2 px-3 py-2">
        <input
          id="isPickup"
          type="checkbox"
          checked={isPickup}
          onChange={(e) => {
            setIsPickup(e.target.checked);
          }}
          className="mr-2"
        />
        <label
          htmlFor="isPickup"
          className="form-label relative flex items-center gap-2"
        >
          Abholung vor Ort
          <Link
            className="group flex items-center gap-2"
            target="_blank"
            rel="noreferrer"
            href="https://www.google.com/maps/search/?api=1&query=Digitaldruck%20Pirrot%20GmbH,Trierer%20Str"
          >
            <CircleQuestionMark className="size-5" />{" "}
            <span className="text-pirrot-red-500 hidden group-hover:flex">
              Zur Filiale
            </span>
          </Link>
        </label>
      </div>
      <div className="field-shell text-info-950 flex w-full items-center gap-2 px-3 py-2">
        <input
          id="saveUser"
          type="checkbox"
          checked={saveUser ?? false}
          onChange={(e) => setSaveUser(e.target.checked)}
          className="mr-2"
        />
        <label htmlFor="saveUser" className="form-label">
          Daten für nächsten Besuch speichern
        </label>
      </div>

      <div className="flex w-full basis-full flex-wrap gap-2">
        <button
          type="button"
          onClick={handleOrderCancel}
          className="btn-soft relative flex cursor-pointer items-center justify-center gap-1 px-4 py-2 font-bold"
        >
          Abbrechen <XIcon />
        </button>
        <button
          type="button"
          disabled={!isOrderFormStateValid}
          onClick={handleSaveConfigOrder}
          className="btn-solid relative flex cursor-pointer items-center justify-center gap-1 px-4 py-2 font-bold disabled:opacity-25"
        >
          Zahlungspflichtig bestellen <Coins />
        </button>
      </div>
    </div>
  );
}
