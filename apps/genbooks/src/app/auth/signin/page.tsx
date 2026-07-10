"use client";

import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { useState, useCallback, useEffect, Suspense } from "react";
import {
  Mail,
  ArrowLeft,
  CheckCircle,
  XCircle,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";

const ERROR_MESSAGES: Record<string, string> = {
  Configuration: "Konfigurationsfehler. Bitte kontaktieren Sie den Support.",
  AccessDenied: "Zugriff verweigert. Sie haben keine Berechtigung.",
  Verification: "Der Link ist abgelaufen oder wurde bereits verwendet.",
  OAuthSignIn: "OAuth-Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.",
  OAuthCallback: "OAuth-Fehler. Bitte versuchen Sie es erneut.",
  EmailSignIn:
    "E-Mail-Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.",
  Callback: "Ein Fehler ist während der Anmeldung aufgetreten.",
  SessionRequired: "Diese Seite erfordert eine Anmeldung.",
  Default:
    "Ein unbekannter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
};

function SignInContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const callbackUrl = searchParams?.get("callbackUrl") ?? "/dashboard";
  const error = searchParams?.get("error");

  const [emailValue, setEmailValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const getErrorMessage = useCallback((err: string): string => {
    return (ERROR_MESSAGES[err] ?? ERROR_MESSAGES.Default)!;
  }, []);

  const getAbsoluteCallbackUrl = useCallback((): string => {
    if (typeof window === "undefined") return callbackUrl;

    try {
      return new URL(callbackUrl, window.location.origin).toString();
    } catch {
      return `${window.location.origin}/dashboard`;
    }
  }, [callbackUrl]);

  useEffect(() => {
    if (error) {
      setShowError(true);
      setErrorMessage(getErrorMessage(error));
    }
  }, [error, getErrorMessage]);

  const handleGoogleSignIn = () => {
    void signIn("google", { callbackUrl: getAbsoluteCallbackUrl() });
  };

  const handleEmailSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!emailValue) return;

    setShowError(false);
    setErrorMessage("");
    setIsLoading(true);
    try {
      const result = await signIn("nodemailer", {
        email: emailValue,
        callbackUrl: getAbsoluteCallbackUrl(),
        redirect: false,
      });

      if (result?.error) {
        setShowError(true);
        setErrorMessage(getErrorMessage(result.error));
        return;
      }

      if (!result?.ok) {
        setShowError(true);
        setErrorMessage(
          "E-Mail konnte nicht gesendet werden. Bitte versuchen Sie es erneut.",
        );
        return;
      }

      setEmailSent(true);
    } catch {
      setShowError(true);
      setErrorMessage(
        "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const closeErrorModal = () => {
    setShowError(false);
    setErrorMessage("");
    router.push("/api/auth/signin");
  };

  return (
    <div className="from-pirrot-blue-50 to-pirrot-blue-100/20 flex min-h-screen items-center justify-center bg-gradient-to-b p-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl bg-white p-8 shadow-xl">
          <h1 className="text-pirrot-blue-950 mb-2 text-2xl font-bold">
            Anmelden
          </h1>
          <p className="mb-8 text-gray-600">Wählen Sie Ihre Anmeldemethode</p>

          {emailSent ? (
            <div className="py-8 text-center">
              <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-500" />
              <h2 className="mb-2 text-xl font-bold text-gray-900">
                E-Mail gesendet!
              </h2>
              <p className="mb-6 text-gray-600">
                Bitte überprüfen Sie Ihre E-Mail und klicken Sie auf den Link,
                um sich anzumelden.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEmailSent(false);
                  setEmailValue("");
                }}
                className="text-pirrot-blue-600 hover:text-pirrot-blue-800 font-medium"
              >
                E-Mail erneut senden
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="mb-6 flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Mit Google anmelden
              </button>

              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-4 text-gray-500">oder</span>
                </div>
              </div>

              <form onSubmit={handleEmailSignIn}>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium text-gray-700"
                >
                  E-Mail-Adresse
                </label>
                <div className="relative mb-4">
                  <Mail className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-400" />
                  <input
                    id="email"
                    type="email"
                    value={emailValue}
                    onChange={(e) => setEmailValue(e.target.value)}
                    placeholder="ihre@email.de"
                    className="focus:ring-pirrot-blue-500 focus:border-pirrot-blue-500 w-full rounded-lg border border-gray-300 py-3 pr-4 pl-10 outline-none focus:ring-2"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !emailValue}
                  className="bg-pirrot-blue-500 hover:bg-pirrot-blue-600 disabled:bg-pirrot-blue-300 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium text-white transition-colors"
                >
                  {isLoading ? (
                    <>
                      <LoaderCircle className="h-5 w-5 animate-spin" />
                      Wird gesendet...
                    </>
                  ) : (
                    "Anmelden-Link senden"
                  )}
                </button>
              </form>
            </>
          )}

          <div className="mt-6 border-t border-gray-200 pt-6">
            <Link
              href="/"
              className="text-pirrot-blue-600 hover:text-pirrot-blue-800 flex items-center gap-2 font-medium"
            >
              <ArrowLeft className="h-4 w-4" />
              Zurück zur Startseite
            </Link>
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-gray-500">
          Mit der Anmeldung stimmen Sie unseren AGB zu.
        </p>
      </div>

      {showError && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={closeErrorModal}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="error-modal-title"
          aria-describedby="error-modal-desc"
        >
          <div
            className="m-4 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <XCircle className="h-8 w-8 text-red-500" />
              <h2
                id="error-modal-title"
                className="text-xl font-bold text-gray-900"
              >
                Anmeldung fehlgeschlagen
              </h2>
            </div>
            <p id="error-modal-desc" className="mb-6 text-gray-600">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={closeErrorModal}
              className="bg-pirrot-blue-500 hover:bg-pirrot-blue-600 w-full rounded-lg px-4 py-3 font-medium text-white transition-colors"
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="from-pirrot-blue-50 to-pirrot-blue-100/20 flex min-h-screen items-center justify-center bg-gradient-to-b p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-xl">
            <LoaderCircle className="text-pirrot-blue-500 mx-auto h-8 w-8 animate-spin" />
            <p className="mt-4 text-gray-600">Wird geladen...</p>
          </div>
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
