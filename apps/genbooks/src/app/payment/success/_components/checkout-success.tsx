"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import LoadingSpinner from "@/app/_components/loading-spinner";
import { api } from "@/trpc/react";
import { getRetryAfterSeconds } from "@/util/trpc-error";

type CheckoutSuccessProps = {
  sessionId?: string;
  orderRef?: string;
  flow?: string;
};

const AUTO_REDIRECT_SECONDS = 10;

export default function CheckoutSuccess({
  sessionId,
  orderRef,
  flow,
}: CheckoutSuccessProps) {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ready" | "error">(
    orderRef ? "ready" : sessionId ? "loading" : "error",
  );
  const [orderPayload, setOrderPayload] = useState(orderRef ?? "");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(AUTO_REDIRECT_SECONDS);
  const hasInitialized = useRef(false);

  const orderViewHref = useMemo(() => {
    if (!orderPayload) return "/order/view";
    return `/order/view?pl=${encodeURIComponent(orderPayload)}`;
  }, [orderPayload]);

  const validateOrder = api.order.validate.useMutation({
    onSuccess: (payload) => {
      setOrderPayload(payload);
      setState("ready");
      setErrorText(null);
      setRetryAfter(null);
      setCountdown(AUTO_REDIRECT_SECONDS);
    },
    onError: (error) => {
      const retryAfterSeconds = getRetryAfterSeconds(error);
      if (retryAfterSeconds) {
        setRetryAfter(retryAfterSeconds);
        setErrorText(
          `Zu viele Anfragen. Wir versuchen es in ${retryAfterSeconds} Sekunden erneut.`,
        );
      } else {
        setRetryAfter(null);
        setErrorText(
          error.message ||
            "Bestellung konnte nicht bestätigt werden. Bitte erneut versuchen.",
        );
      }
      setState("error");
    },
  });

  const validateSessionCheckout = useCallback(() => {
    if (!sessionId) return;
    setState("loading");
    setErrorText(null);
    setRetryAfter(null);
    validateOrder.mutate({ session: sessionId });
  }, [sessionId, validateOrder]);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    if (orderRef) {
      setState("ready");
      setOrderPayload(orderRef);
      setCountdown(AUTO_REDIRECT_SECONDS);
      return;
    }
    if (sessionId) {
      validateSessionCheckout();
      return;
    }
    setState("error");
    setErrorText("Es wurde keine abgeschlossene Bestellung übergeben.");
  }, [orderRef, sessionId, validateSessionCheckout]);

  useEffect(() => {
    if (retryAfter === null) return;
    if (retryAfter <= 0) {
      setRetryAfter(null);
      if (sessionId) {
        validateSessionCheckout();
      }
      return;
    }
    const timeoutId = setTimeout(() => {
      setRetryAfter((current) => (current === null ? null : current - 1));
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [retryAfter, sessionId, validateSessionCheckout]);

  useEffect(() => {
    if (state !== "ready" || !orderPayload) return;
    if (countdown <= 0) {
      router.push(orderViewHref);
      return;
    }
    const timeoutId = setTimeout(() => {
      setCountdown((current) => current - 1);
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [countdown, orderPayload, orderViewHref, router, state]);

  if (state === "loading") {
    return (
      <div className="content-card w-full max-w-2xl p-8 text-center">
        <div className="mb-4 rounded-lg border-2 border-pirrot-red-500 bg-pirrot-red-50 px-4 py-3 text-left text-sm font-bold uppercase tracking-wide text-pirrot-red-700">
          Wichtig: Fenster nicht schließen. Sie werden automatisch
          weitergeleitet.
        </div>
        <div className="mx-auto mb-4 flex w-fit items-center justify-center rounded-full bg-pirrot-blue-100 p-4 text-pirrot-blue-700">
          <LoadingSpinner />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-info-950">
          Bestellung wird bestätigt
        </h1>
        <p className="text-info-700">
          Wir prüfen den Checkout und erstellen Ihre Bestellbestätigung.
        </p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="content-card w-full max-w-2xl p-8 text-center">
        <div className="mx-auto mb-4 flex w-fit items-center justify-center rounded-full bg-pirrot-red-100 p-3 text-pirrot-red-600">
          <AlertCircle className="size-8" />
        </div>
        <h1 className="mb-2 text-2xl font-bold text-info-950">
          Bestätigung fehlgeschlagen
        </h1>
        <p className="mb-6 text-info-700">
          {errorText ??
            "Die Bestellung konnte nicht validiert werden. Bitte erneut versuchen."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {sessionId ? (
            <button
              type="button"
              onClick={validateSessionCheckout}
              className="btn-solid inline-flex items-center gap-2 px-4 py-2"
              disabled={validateOrder.isPending}
            >
              <RefreshCw className="size-4" />
              Erneut versuchen
            </button>
          ) : null}
          <Link className="btn-soft inline-flex items-center px-4 py-2" href="/">
            Zur Startseite
          </Link>
        </div>
      </div>
    );
  }

  const isDirectFlow = flow === "direct" || !sessionId;
  return (
    <div className="content-card w-full max-w-3xl p-8">
      <div className="mb-6 flex flex-col gap-4 border-b border-pirrot-blue-200/40 pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-success-100 px-3 py-1 text-sm font-semibold text-success-800">
            <CheckCircle2 className="size-4" />
            Bestellung erfolgreich abgeschlossen
          </div>
          <h1 className="text-3xl font-bold text-info-950">Vielen Dank!</h1>
          <p className="mt-2 text-info-700">
            {isDirectFlow
              ? "Ihre Bestellung wurde ohne zusätzliche Zahlung erstellt und bestätigt."
              : "Ihre Zahlung wurde bestätigt und Ihre Bestellung wird nun bearbeitet."}
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-xl border-2 border-pirrot-red-500 bg-pirrot-red-50 p-4 text-pirrot-red-800">
        <p className="text-sm font-bold uppercase tracking-wide">
          Wichtig: Fenster nicht schließen
        </p>
        <p className="mt-1 text-sm">
          Sie werden in{" "}
          <span className="font-bold text-pirrot-red-900">{countdown}</span>{" "}
          Sekunden automatisch zur Bestellansicht weitergeleitet.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href={orderViewHref}
          className="btn-solid inline-flex items-center gap-2 px-5 py-2"
        >
          Bestellung öffnen
          <ArrowRight className="size-4" />
        </Link>
        <Link
          href="/dashboard?view=orders"
          className="btn-soft inline-flex items-center px-5 py-2"
        >
          Zur Bestellübersicht
        </Link>
      </div>
    </div>
  );
}
