"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import LoadingSpinner from "@/app/_components/loading-spinner";
import { api } from "@/trpc/react";
import { getPageRules } from "@/server/util/pdf/functions";

export default function TypeForm(props: { typeId?: string }) {
  const { typeId } = props;
  const router = useRouter();
  const utils = api.useUtils();

  const { data: initialInputs, isLoading } = api.type.getById.useQuery(
    {
      typeId: typeId ?? "",
    },
    {
      enabled: typeId !== undefined,
    },
  );

  const [name, setName] = useState(initialInputs?.name ?? "");
  const [minPages, setMinPages] = useState(initialInputs?.minPages ?? 0);
  const [maxPages, setMaxPages] = useState(initialInputs?.maxPages ?? 1);
  const [submitError, setSubmitError] = useState<string | undefined>();

  useEffect(() => {
    if (!initialInputs) return;
    setName(initialInputs.name);
    setMinPages(initialInputs.minPages);
    setMaxPages(initialInputs.maxPages);
  }, [initialInputs]);

  const createType = api.type.create.useMutation({
    onSuccess: async () => {
      await utils.type.invalidate();
      router.push("/dashboard/types");
    },
    onError: (error) => setSubmitError(error.message),
  });

  const updateType = api.type.update.useMutation({
    onSuccess: async () => {
      await utils.type.invalidate();
      router.push("/dashboard/types");
    },
    onError: (error) => setSubmitError(error.message),
  });

  async function handleSubmitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(undefined);

    if (initialInputs?.id) {
      await updateType.mutateAsync({
        id: initialInputs.id,
        name,
        minPages,
        maxPages,
      });
      return;
    }

    await createType.mutateAsync({
      name,
      minPages,
      maxPages,
    });
  }

  if (isLoading) return <LoadingSpinner />;

  const pending = createType.isPending || updateType.isPending;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(20rem,30rem)_minmax(0,1fr)]">
      <div className="glass-card-soft p-5 lg:p-6">
        <div className="border-b border-pirrot-blue-200/10 pb-5">
          <div className="badge-shell w-fit">Type workspace</div>
          <h3 className="mt-3 text-2xl font-black text-white sm:text-3xl">
            {typeId ? "Typ aktualisieren" : "Typ anlegen"}
          </h3>
          <p className="text-pirrot-blue-100/72 mt-3 text-sm leading-6">
            Pflegen Sie Seitengrenzen so, dass Kategorien im Modulbereich sauber
            eingeordnet und auch auf kleineren Displays schnell bearbeitet
            werden können.
          </p>
        </div>

        <form onSubmit={handleSubmitForm} className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-pirrot-blue-100">
              Name
            </label>
            <input
              className="soft-input"
              onChange={(event) => setName(event.target.value)}
              value={name}
              placeholder="z. B. wochenplaner"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-pirrot-blue-100">
                Min
              </label>
              <input
                className="soft-input"
                onChange={(event) => setMinPages(Number(event.target.value))}
                value={minPages}
                type="number"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-pirrot-blue-100">
                Max
              </label>
              <input
                className="soft-input"
                onChange={(event) => setMaxPages(Number(event.target.value))}
                value={maxPages}
                type="number"
              />
            </div>
          </div>

          {submitError ? (
            <div className="rounded-lg border border-pirrot-red-300/30 bg-pirrot-red-950/35 px-4 py-3 text-sm text-pirrot-red-100">
              {submitError}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/dashboard/types" className="btn-secondary flex-1">
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
            Seitenregel
          </h3>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="field-shell p-5">
            <p className="compact-label text-[11px] uppercase text-pirrot-blue-200/65">
              Aktuelle Regel
            </p>
            <p className="mt-3 text-2xl font-black text-white sm:text-3xl">
              {getPageRules({ min: minPages, max: maxPages })}
            </p>
          </div>
          <div className="field-shell p-5">
            <p className="compact-label text-[11px] uppercase text-pirrot-blue-200/65">
              Typname
            </p>
            <p className="mt-3 break-words text-xl font-black uppercase text-white sm:text-2xl">
              {name.trim() || "unbenannt"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
