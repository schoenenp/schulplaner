"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle, Mail, TriangleAlert } from "lucide-react";

import LoadingSpinner from "@/app/_components/loading-spinner";
import { api } from "@/trpc/react";
import {
  claimedPlannerPath,
  templateSignInPath,
} from "@/util/template-share-navigation";

type TemplateShareEntryProps = {
  token?: string;
  errorCode?: string;
  isLoggedIn: boolean;
  sessionEmail?: string | null;
};

function getErrorMessage(errorCode?: string) {
  switch (errorCode) {
    case "missing-token":
      return "Der Template-Link ist unvollstaendig.";
    case "claim-failed":
      return "Die Vorlage konnte nicht beansprucht werden. Bitte pruefen Sie den Link.";
    case "invalid-token":
      return "Der Template-Link ist ungueltig oder abgelaufen.";
    default:
      return null;
  }
}

export default function TemplateShareEntry({
  token,
  errorCode,
  isLoggedIn,
  sessionEmail,
}: TemplateShareEntryProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const routeError = getErrorMessage(errorCode);

  const share = api.templateShare.getShare.useQuery(
    { token: token ?? "" },
    {
      enabled: Boolean(token),
      retry: false,
    },
  );
  const claim = api.templateShare.claim.useMutation({
    onSuccess: async (data) => {
      await utils.book.getUserBooks.invalidate();
      router.push(claimedPlannerPath(data.bookId));
    },
  });

  if (!token || routeError) {
    return (
      <section className="border-pirrot-red-300 bg-pirrot-red-100 w-full max-w-2xl rounded border p-6">
        <div className="flex items-center gap-3">
          <TriangleAlert className="text-pirrot-red-500 size-6" />
          <h1 className="text-2xl font-bold">Template-Link nicht verfuegbar</h1>
        </div>
        <p className="mt-3">
          {routeError ?? "Der Link enthaelt kein gueltiges Token."}
        </p>
      </section>
    );
  }

  if (share.isLoading) {
    return (
      <section className="flex w-full max-w-2xl items-center justify-center rounded border border-white/30 bg-white/40 p-10">
        <LoadingSpinner />
      </section>
    );
  }

  if (share.isError || !share.data) {
    return (
      <section className="border-pirrot-red-300 bg-pirrot-red-100 w-full max-w-2xl rounded border p-6">
        <div className="flex items-center gap-3">
          <TriangleAlert className="text-pirrot-red-500 size-6" />
          <h1 className="text-2xl font-bold">Template-Link nicht verfuegbar</h1>
        </div>
        <p className="mt-3">
          {share.error?.message ?? "Die Vorlage konnte nicht geladen werden."}
        </p>
        {!isLoggedIn && (
          <Link
            className="btn-solid mt-4 inline-flex px-4 py-3"
            href={templateSignInPath(token)}
          >
            Anmelden und vorhandenen Planer öffnen
          </Link>
        )}
        {isLoggedIn && (
          <Link
            className="btn-soft mt-4 inline-flex px-4 py-3"
            href="/dashboard?view=planer"
          >
            Zu meinen Planern
          </Link>
        )}
      </section>
    );
  }

  return (
    <section className="w-full max-w-2xl rounded border border-white/30 bg-white/40 p-6">
      <h1 className="text-3xl font-black uppercase">Vorlage beanspruchen</h1>
      <p className="mt-3">
        Diese Vorlage wird als eigener Planer in Ihrem Dashboard angelegt und
        kann danach frei bearbeitet werden.
      </p>

      <div className="border-pirrot-blue-300/30 bg-pirrot-blue-50/60 mt-6 rounded border p-4">
        <h2 className="text-xl font-bold">{share.data.template.name}</h2>
        <p className="mt-1 text-sm">
          Module in der Vorlage: <b>{share.data.template.moduleCount}</b>
        </p>
        {share.data.recipientEmail ? (
          <p className="text-info-700 mt-1 text-sm">
            Einladung fuer: <b>{share.data.recipientEmail}</b>
          </p>
        ) : null}
      </div>

      {isLoggedIn ? (
        <div className="mt-6 flex flex-col gap-3">
          {sessionEmail ? (
            <p className="text-info-700 flex items-center gap-2 text-sm">
              <Mail size={16} />
              Angemeldet als {sessionEmail}
            </p>
          ) : null}
          {share.data.existingBookId ? (
            <Link
              href={claimedPlannerPath(share.data.existingBookId)}
              className="btn-solid w-fit px-4 py-3"
            >
              Meinen Planer öffnen
            </Link>
          ) : share.data.recipientMatchesSession === false ? (
            <div className="flex flex-col gap-3">
              <p>
                Diese Einladung gehört zu einer anderen E-Mail-Adresse. Bitte
                melden Sie sich mit der eingeladenen Adresse an.
              </p>
              <button
                type="button"
                className="btn-solid w-fit px-4 py-3"
                onClick={() =>
                  void signOut({ callbackUrl: templateSignInPath(token) })
                }
              >
                Mit anderer E-Mail anmelden
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => claim.mutate({ token })}
              disabled={claim.isPending}
              className="btn-solid w-fit px-4 py-3 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {claim.isPending
                ? "Wird übernommen..."
                : "Vorlage übernehmen und öffnen"}
            </button>
          )}
          {claim.error ? (
            <p className="border-pirrot-red-200 bg-pirrot-red-50 text-pirrot-red-500 rounded border p-3 text-sm">
              {claim.error.message}
            </p>
          ) : null}
          {claim.data ? (
            <p className="border-pirrot-blue-200 bg-pirrot-blue-50 text-pirrot-blue-700 flex items-center gap-2 rounded border p-3 text-sm">
              <CheckCircle size={16} />
              Vorlage wurde übernommen. Der Planer wird geöffnet.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-6">
          <p className="text-info-700 text-sm">
            Bitte melden Sie sich an. Wenn noch kein Konto existiert, wird es
            nach der E-Mail-Bestaetigung automatisch erstellt.
          </p>
          <Link
            href={templateSignInPath(token)}
            className="btn-solid mt-4 inline-flex px-4 py-3"
          >
            Anmelden und beanspruchen
          </Link>
        </div>
      )}
    </section>
  );
}
