import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { brand } from "@/brand";
import { env } from "@/env";
import { SubmitButton } from "@/components/submit-button";
import { auth, signIn } from "@/server/auth";
import { canDeliverMail } from "@/server/mail";

export const metadata = { title: "Anmelden" };

function safeCallback(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/planer";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const target = safeCallback(callbackUrl);
  const session = await auth();
  if (session?.user) redirect(target);

  async function requestLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    try {
      await signIn("nodemailer", { email, redirectTo: target, redirect: false });
    } catch (cause) {
      if (cause instanceof AuthError) {
        redirect(`/anmelden?error=1&callbackUrl=${encodeURIComponent(target)}`);
      }
      throw cause;
    }
    // Auth.js would route through /api/auth/verify-request; go straight to
    // the page so the address bar shows it too.
    redirect("/anmelden/pruefen");
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div>
        <h1 className="text-3xl">Anmelden</h1>
        <p className="mt-2 text-muted">
          Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen einen Link, mit dem Sie
          sich ohne Passwort bei {brand.name} anmelden.
        </p>
      </div>
      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          Die Anmeldung hat nicht geklappt. Bitte fordern Sie einen neuen Link an.
        </p>
      )}
      <form action={requestLink} className="card flex flex-col gap-4">
        <label className="label">
          E-Mail-Adresse
          <input
            className="input"
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="sekretariat@schule.de"
          />
        </label>
        <SubmitButton pendingText="Link wird gesendet …">Anmeldelink senden</SubmitButton>
      </form>
      {!canDeliverMail() && env.NODE_ENV !== "production" && (
        <p className="hint">
          Entwicklungsmodus: Es werden keine E-Mails verschickt. Der Anmeldelink steht im
          Server-Log (<code>mail_not_sent_logged_only</code>).
        </p>
      )}
    </div>
  );
}
