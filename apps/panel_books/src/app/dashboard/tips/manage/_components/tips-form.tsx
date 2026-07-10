"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import LoadingSpinner from "@/app/_components/loading-spinner";
import { api } from "@/trpc/react";

export default function TipsForm(props: { tipId?: string }) {
  const { tipId } = props;
  const router = useRouter();
  const utils = api.useUtils();

  const { data: initialInputs, isLoading } = api.tip.getById.useQuery(
    {
      tipId: Number(tipId),
    },
    {
      enabled: tipId !== undefined,
    },
  );

  const [tip, setTip] = useState(initialInputs?.tip ?? "");
  const [title, setTitle] = useState(initialInputs?.title ?? "");
  const [submitError, setSubmitError] = useState<string | undefined>();

  useEffect(() => {
    if (!initialInputs) return;
    setTip(initialInputs.tip);
    setTitle(initialInputs.title);
  }, [initialInputs]);

  const createTip = api.tip.create.useMutation({
    onSuccess: async () => {
      await utils.tip.invalidate();
      router.push("/dashboard/tips");
    },
    onError: (error) => setSubmitError(error.message),
  });

  const updateTip = api.tip.update.useMutation({
    onSuccess: async () => {
      await utils.tip.invalidate();
      router.push("/dashboard/tips");
    },
    onError: (error) => setSubmitError(error.message),
  });

  async function handleSubmitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(undefined);

    if (initialInputs?.id) {
      await updateTip.mutateAsync({
        id: initialInputs.id,
        title,
        tip,
      });
      return;
    }

    await createTip.mutateAsync({
      title,
      tip,
    });
  }

  if (isLoading) return <LoadingSpinner />;

  const pending = createTip.isPending || updateTip.isPending;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(20rem,32rem)_minmax(0,1fr)]">
      <div className="glass-card-soft p-5 lg:p-6">
        <div className="border-b border-pirrot-blue-200/10 pb-5">
          <div className="badge-shell w-fit">Tooltip workspace</div>
          <h3 className="mt-3 text-2xl font-black text-white sm:text-3xl">
            {tipId ? "Tooltip aktualisieren" : "Tooltip anlegen"}
          </h3>
          <p className="text-pirrot-blue-100/72 mt-3 text-sm leading-6">
            Halten Sie Hilfetexte kompakt, klar und im Layout direkt lesbar,
            egal ob auf Mobilgeräten oder am großen Arbeitsplatz.
          </p>
        </div>

        <form onSubmit={handleSubmitForm} className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-pirrot-blue-100">
              Titel
            </label>
            <input
              className="soft-input"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
              placeholder="z. B. Versandhinweis"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-pirrot-blue-100">
              Text
            </label>
            <textarea
              className="soft-input min-h-48"
              rows={8}
              onChange={(event) => setTip(event.target.value)}
              value={tip}
              placeholder="Beschreiben Sie den Hinweistext für Nutzerinnen und Nutzer."
            />
          </div>

          {submitError ? (
            <div className="rounded-lg border border-pirrot-red-300/30 bg-pirrot-red-950/35 px-4 py-3 text-sm text-pirrot-red-100">
              {submitError}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/dashboard/tips" className="btn-secondary flex-1">
              Abbrechen
            </Link>
            <button
              type="submit"
              disabled={pending}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {pending ? "Speichert..." : "Speichern"}
            </button>
          </div>
        </form>
      </div>

      <div className="glass-card-soft p-5 lg:p-6">
        <div className="border-b border-pirrot-blue-200/10 pb-5">
          <p className="compact-label text-xs font-semibold uppercase text-pirrot-blue-200/70">
            Vorschau
          </p>
          <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">
            Lesefluss
          </h3>
        </div>

        <div className="field-shell mt-6 p-5">
          <p className="compact-label break-words text-xs uppercase text-pirrot-blue-200/65">
            {title.trim() || "Unbenannter Tooltip"}
          </p>
          <p className="mt-4 break-words text-base leading-7 text-pirrot-blue-50/90">
            {tip.trim() ||
              "Hier erscheint die Vorschau des Hilfetexts, sobald Inhalt vorhanden ist."}
          </p>
        </div>
      </div>
    </div>
  );
}
