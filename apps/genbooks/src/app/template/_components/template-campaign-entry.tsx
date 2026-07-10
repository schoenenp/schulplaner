"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import LoadingSpinner from "@/app/_components/loading-spinner";
import Link from "next/link";

type TemplateCampaignEntryProps = {
  token?: string;
  claimToken?: string;
  sessionEmail?: string | null;
  isLoggedIn: boolean;
  isDemoView: boolean;
};

export default function TemplateCampaignEntry({
  token,
  claimToken,
  sessionEmail,
  isLoggedIn,
  isDemoView,
}: TemplateCampaignEntryProps) {
  const router = useRouter();
  const normalizedSessionEmail = sessionEmail?.trim() ?? "";
  const isSessionEmailLocked = normalizedSessionEmail.length > 0;
  const [promoCode, setPromoCode] = useState("");
  const [email, setEmail] = useState(normalizedSessionEmail);
  const hasAttemptedClaimCompletionRef = useRef(false);

  const {
    data: campaignData,
    isLoading,
    isError,
    error,
  } = api.partner.getCampaignTemplate.useQuery(
    {
      token: token ?? "",
    },
    {
      enabled: Boolean(token),
      retry: false,
    },
  );

  const startPartnerClaim = api.partner.startPartnerClaim.useMutation();
  const completePartnerClaim = api.partner.completePartnerClaim.useMutation({
    onSuccess: (data) => {
      if (!data?.bookId || !data?.partnerCheckoutToken) {
        return;
      }
      router.push(
        `/config?bookId=${encodeURIComponent(data.bookId)}&pt=${encodeURIComponent(data.partnerCheckoutToken)}`,
      );
    },
  });

  const moduleCount = campaignData?.template?.modules?.length ?? 0;

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const normalizedEmail = email.trim();
  const canSubmit =
    promoCode.trim().length >= 6 &&
    (isSessionEmailLocked || isValidEmail(normalizedEmail)) &&
    !startPartnerClaim.isPending;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !canSubmit) {
      return;
    }

    startPartnerClaim.mutate({
      token,
      promoCode: promoCode.trim().toUpperCase(),
      email: isSessionEmailLocked ? normalizedSessionEmail : normalizedEmail,
    });
  };

  const callbackUrl = useMemo(() => {
    if (!claimToken) {
      return "/template";
    }
    return `/template?claim=${encodeURIComponent(claimToken)}`;
  }, [claimToken]);

  useEffect(() => {
    if (!claimToken || !isLoggedIn || hasAttemptedClaimCompletionRef.current) {
      return;
    }
    hasAttemptedClaimCompletionRef.current = true;
    void completePartnerClaim.mutateAsync({ claimToken }).catch(() => {
      // Error state is surfaced by completePartnerClaim.error in the UI.
    });
  }, [claimToken, completePartnerClaim, isLoggedIn]);

  if (claimToken) {
    if (!isLoggedIn) {
      return (
        <section className="w-full max-w-2xl rounded border border-white/30 bg-white/40 p-6">
          <h1 className="text-3xl font-black uppercase">
            Partner-Angebot bestätigen
          </h1>
          <p className="mt-3">
            Bitte melden Sie sich mit derselben E-Mail-Adresse an, an die der
            Verifizierungslink gesendet wurde.
          </p>
          <Link
            href={`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="bg-pirrot-blue-500 hover:bg-pirrot-blue-600 mt-6 inline-block rounded p-3 font-bold text-white transition-colors"
          >
            Anmelden und fortfahren
          </Link>
        </section>
      );
    }

    return (
      <section className="w-full max-w-2xl rounded border border-white/30 bg-white/40 p-6">
        <h1 className="text-3xl font-black uppercase">
          Partner-Angebot wird bestätigt
        </h1>
        <p className="mt-3">
          Bitte warten Sie, Sie werden gleich zur Konfiguration weitergeleitet.
        </p>
        {completePartnerClaim.isPending ? <LoadingSpinner /> : null}
        {completePartnerClaim.error ? (
          <p className="border-pirrot-red-200 bg-pirrot-red-50 text-pirrot-red-500 mt-4 rounded border p-3 text-sm">
            {completePartnerClaim.error.message}
          </p>
        ) : null}
      </section>
    );
  }

  if (!token) {
    if (isDemoView) {
      return (
        <section className="w-full max-w-2xl rounded border border-white/30 bg-white/40 p-6">
          <h1 className="text-3xl font-black uppercase">
            Template-Entry Demo-Vorschau
          </h1>
          <p className="mt-3 text-info-800">
            Diese Vorschau zeigt, wie Schulen eine Partner-Vorlage aktivieren.
            Für den echten Ablauf wird ein Kampagnen-Link mit Token benötigt.
          </p>

          <div className="border-pirrot-blue-300/30 bg-pirrot-blue-50/60 mt-6 rounded border p-4">
            <h2 className="text-xl font-bold">Partner-Planer (Demo)</h2>
            <p className="mt-1 text-sm">Module in der Basisvorlage: <b>8</b></p>
          </div>

          <form className="mt-6 flex flex-col gap-3">
            <label htmlFor="promoCodeDemo" className="font-semibold">
              Promo-Code
            </label>
            <input
              id="promoCodeDemo"
              type="text"
              value="SP-DEMO1234"
              readOnly
              className="border-pirrot-blue-300/40 w-full rounded border bg-white p-3"
            />
            <button
              type="button"
              disabled
              className="bg-pirrot-blue-500 rounded p-3 font-bold text-white opacity-60"
            >
              Verifizierung starten
            </button>
          </form>

          <div className="mt-4 flex flex-col gap-3">
            <label htmlFor="emailDemo" className="font-semibold">
              E-Mail-Adresse
            </label>
            <input
              id="emailDemo"
              type="email"
              value="schule@beispiel.at"
              readOnly
              className="border-pirrot-blue-300/40 w-full rounded border bg-white p-3"
            />
          </div>
        </section>
      );
    }

    return (
      <section className="bg-pirrot-red-100 border-pirrot-red-300 w-full max-w-2xl rounded border p-6">
        <h2 className="text-2xl font-bold">Ungültiger Partner-Link</h2>
        <p className="mt-2">Der Link enthält kein gültiges Kampagnen-Token.</p>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="flex w-full max-w-2xl items-center justify-center rounded border border-white/30 bg-white/40 p-10">
        <LoadingSpinner />
      </section>
    );
  }

  if (isError || !campaignData) {
    return (
      <section className="bg-pirrot-red-100 border-pirrot-red-300 w-full max-w-2xl rounded border p-6">
        <h2 className="text-2xl font-bold">Kampagne nicht verfügbar</h2>
        <p className="mt-2">
          {error?.message ?? "Die Kampagne konnte nicht geladen werden."}
        </p>
      </section>
    );
  }

  return (
    <section className="w-full max-w-2xl rounded border border-white/30 bg-white/40 p-6">
      <h1 className="text-3xl font-black uppercase">
        Partner-Vorlage aktivieren
      </h1>
      <p className="mt-3">
        Geben Sie den Promo-Code ein, um die Partner-Vorlage freizuschalten.
      </p>

      <div className="border-pirrot-blue-300/30 bg-pirrot-blue-50/60 mt-6 rounded border p-4">
        <h2 className="text-xl font-bold">
          {campaignData.template.name ?? "Partner-Planer"}
        </h2>
        <p className="mt-1 text-sm">
          Module in der Basisvorlage: <b>{moduleCount}</b>
        </p>
      </div>

      <form className="mt-6 flex flex-col gap-3" onSubmit={handleSubmit}>
        <label htmlFor="promoCode" className="font-semibold">
          Promo-Code
        </label>
        <input
          id="promoCode"
          type="text"
          value={promoCode}
          onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
          className="border-pirrot-blue-300/40 w-full rounded border bg-white p-3"
          placeholder="z. B. SP-AB12CD34"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          className="bg-pirrot-blue-500 hover:bg-pirrot-blue-600 rounded p-3 font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {startPartnerClaim.isPending
            ? "Verifizierung wird gesendet..."
            : "Verifizierung starten"}
        </button>
      </form>

      <div className="mt-4 flex flex-col gap-3">
        <label htmlFor="email" className="font-semibold">
          E-Mail-Adresse {isLoggedIn ? "(angemeldet)" : ""}
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isSessionEmailLocked}
          className="border-pirrot-blue-300/40 w-full rounded border bg-white p-3 disabled:bg-gray-100 disabled:text-gray-500"
          placeholder="ihre@email.at"
        />
        {isSessionEmailLocked && (
          <p className="text-sm text-gray-600">
            Sie sind angemeldet als {normalizedSessionEmail}
          </p>
        )}
      </div>

      {startPartnerClaim.error && (
        <p className="border-pirrot-red-200 bg-pirrot-red-50 text-pirrot-red-500 mt-4 rounded border p-3 text-sm">
          {startPartnerClaim.error.message}
        </p>
      )}
      {startPartnerClaim.data?.verificationSent ? (
        <p className="border-pirrot-blue-200 bg-pirrot-blue-50 text-pirrot-blue-700 mt-4 rounded border p-3 text-sm">
          Verifizierungslink gesendet an {startPartnerClaim.data.email}. Bitte
          E-Mail bestätigen und dann fortfahren.
        </p>
      ) : null}
    </section>
  );
}
