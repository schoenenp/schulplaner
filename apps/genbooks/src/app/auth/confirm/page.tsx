import { ShieldCheck } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";

import { toAllowedAppOrigin } from "@/util/app-origin";

type ConfirmSignInPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getSafeVerificationUrl(
  value: string | undefined,
  requestHeaders: Headers,
) {
  if (!value) return null;

  try {
    const verificationUrl = new URL(value);
    const safeOrigin = toAllowedAppOrigin(verificationUrl.origin, {
      headers: requestHeaders,
    });

    if (!safeOrigin) return null;
    if (verificationUrl.pathname !== "/api/auth/callback/nodemailer") {
      return null;
    }
    if (!verificationUrl.searchParams.get("token")) return null;
    if (!verificationUrl.searchParams.get("email")) return null;

    const normalizedOrigin = new URL(safeOrigin);
    verificationUrl.protocol = normalizedOrigin.protocol;
    verificationUrl.host = normalizedOrigin.host;
    verificationUrl.port = normalizedOrigin.port;

    return verificationUrl.toString();
  } catch {
    return null;
  }
}

export default async function ConfirmSignInPage({
  searchParams,
}: ConfirmSignInPageProps) {
  const resolvedSearchParams = await searchParams;
  const requestHeaders = await headers();
  const verificationUrl = getSafeVerificationUrl(
    getSingleParam(resolvedSearchParams?.url),
    requestHeaders,
  );

  return (
    <main className="from-pirrot-blue-50 to-pirrot-blue-100/20 flex min-h-screen items-center justify-center bg-gradient-to-b p-4">
      <section className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-xl">
        <ShieldCheck className="text-pirrot-blue-500 mx-auto mb-4 h-12 w-12" />
        <h1 className="text-pirrot-blue-950 mb-3 text-2xl font-bold">
          Anmeldung bestätigen
        </h1>
        <p className="mb-6 text-gray-600">
          Bitte bestätigen Sie, dass Sie sich anmelden möchten.
        </p>

        {verificationUrl ? (
          <form action={verificationUrl} method="post">
            <button
              type="submit"
              className="bg-pirrot-blue-500 hover:bg-pirrot-blue-600 w-full rounded-lg px-4 py-3 font-medium text-white transition-colors"
            >
              Anmelden
            </button>
          </form>
        ) : (
          <>
            <p className="mb-6 text-sm text-red-600">
              Dieser Anmeldelink ist ungültig oder unvollständig.
            </p>
            <Link
              href="/auth/signin"
              className="bg-pirrot-blue-500 hover:bg-pirrot-blue-600 inline-flex w-full justify-center rounded-lg px-4 py-3 font-medium text-white transition-colors"
            >
              Neuen Link anfordern
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
