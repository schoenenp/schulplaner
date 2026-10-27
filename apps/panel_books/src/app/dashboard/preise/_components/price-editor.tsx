"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  CheckIcon,
} from "@heroicons/react/16/solid";
import {
  BINDINGS,
  diffPriceBooks,
  formatPriceFieldValue,
  PRICE_FIELDS,
  priceBookSchema,
  quotePlanner,
  type BindingKey,
  type PriceBook,
  type PriceChange,
  type PriceField,
  type PrintFormat,
} from "pricing";

import LoadingSpinner from "@/app/_components/loading-spinner";
import Modal from "@/app/_components/modal";
import { useToast } from "@/app/_components/toast";
import { api } from "@/trpc/react";
import { formatCents, formatDateTime } from "@/util/format";

type Draft = Record<string, string>;
type FieldErrors = Record<string, string>;

const FIELD_BY_ID = new Map(PRICE_FIELDS.map((field) => [field.id, field]));

const UNIT_SUFFIX: Record<PriceField["unit"], string> = {
  "sheet-cents": "ct",
  cents: "ct",
  "euro-cents": "€",
  percent: "%",
  quantity: "Ex.",
  factor: "",
};

const UNIT_STEP: Record<PriceField["unit"], string> = {
  "sheet-cents": "0.01",
  cents: "1",
  "euro-cents": "0.01",
  percent: "0.01",
  quantity: "1",
  factor: "0.001",
};

const SECTIONS: Array<{
  title: string;
  description: string;
  fields: Array<{ id: string; label?: string }>;
}> = [
  {
    title: "Druck pro SRA3-Bogen",
    description:
      "Ein Bogen fasst 4 Seiten DIN A5 oder 2 Seiten DIN A4. Bogenpreise gelten vor dem Aufschlag.",
    fields: [
      { id: "sheets.grayscale.singleCents" },
      { id: "sheets.grayscale.bulkCents" },
      { id: "sheets.color.singleCents" },
      { id: "sheets.color.bulkCents" },
    ],
  },
  {
    title: "Bindung pro Planer",
    description: "Fester Zuschlag je Planer, ebenfalls vor dem Aufschlag.",
    fields: BINDINGS.map((binding) => ({
      id: `bindings.${binding.key}`,
      label: binding.label,
    })),
  },
  {
    title: "Aufschlag und Mengenstaffel",
    description:
      "Bogenpreise und Aufschlag sinken vom Wert bei 1 Exemplar bis zur Staffelmenge. Eine Rabattkurve unter 1 lässt den Rabatt früh greifen, über 1 erst spät.",
    fields: [
      { id: "margin.singlePercent" },
      { id: "margin.bulkPercent" },
      { id: "volume.bulkQuantity" },
      { id: "volume.curve" },
    ],
  },
  {
    title: "Mindestpreis und Versand",
    description:
      "Der Mindestpreis gilt pro Planer nach dem Aufschlag. Versand wird einmal pro Bestellung berechnet.",
    fields: [
      { id: "minimumUnitCents" },
      { id: "shipping.standardCents" },
      { id: "shipping.expressCents" },
    ],
  },
];

const PREVIEW_QUANTITIES = [1, 10, 25, 50, 100];

// Euro-cent fields are edited in euros; everything else in its stored unit.
function toInput(field: PriceField, book: PriceBook): string {
  const value = field.read(book);
  return field.unit === "euro-cents" ? (value / 100).toFixed(2) : String(value);
}

function fromInput(field: PriceField, raw: string): number {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return Number.NaN;
  const value = Number(normalized);
  return field.unit === "euro-cents" ? Math.round(value * 100) : value;
}

function draftFromBook(book: PriceBook): Draft {
  return Object.fromEntries(
    PRICE_FIELDS.map((field) => [field.id, toInput(field, book)]),
  );
}

function setPath(target: Record<string, unknown>, path: string, value: number) {
  const keys = path.split(".");
  let node = target;
  for (const key of keys.slice(0, -1)) {
    node[key] ??= {};
    node = node[key] as Record<string, unknown>;
  }
  node[keys[keys.length - 1]!] = value;
}

function parseDraft(draft: Draft): {
  priceBook: PriceBook | null;
  errors: FieldErrors;
} {
  const raw: Record<string, unknown> = {};
  const errors: FieldErrors = {};
  for (const field of PRICE_FIELDS) {
    const value = fromInput(field, draft[field.id] ?? "");
    if (!Number.isFinite(value)) errors[field.id] = "Bitte eine Zahl eingeben.";
    setPath(raw, field.id, value);
  }
  const result = priceBookSchema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors[issue.path.join(".")] ??= issue.message;
    }
  }
  return {
    priceBook: result.success && Object.keys(errors).length === 0 ? result.data : null,
    errors,
  };
}

function ChangeList({ changes }: { changes: PriceChange[] }) {
  return (
    <ul className="flex flex-col gap-1 text-sm text-pirrot-blue-100/80">
      {changes.map((change) => (
        <li key={change.id}>
          {change.label}:{" "}
          <span className="text-pirrot-blue-200/60 line-through">
            {formatPriceFieldValue(change.before, change.unit)}
          </span>{" "}
          → <span className="font-semibold text-white">
            {formatPriceFieldValue(change.after, change.unit)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PriceInput({
  fieldId,
  label,
  value,
  saved,
  error,
  onChange,
}: {
  fieldId: string;
  label?: string;
  value: string;
  saved: PriceBook;
  error?: string;
  onChange: (value: string) => void;
}) {
  const field = FIELD_BY_ID.get(fieldId)!;
  const savedValue = field.read(saved);
  const draftValue = fromInput(field, value);
  const changed = Number.isFinite(draftValue) && draftValue !== savedValue;
  const suffix = UNIT_SUFFIX[field.unit];

  return (
    <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
      {label ?? field.label}
      <div className="relative">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={UNIT_STEP[field.unit]}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={Boolean(error)}
          className={`soft-input ${suffix ? "soft-input-trailing" : ""} ${
            error ? "border-amber-400/60" : changed ? "border-pirrot-blue-300/50" : ""
          }`}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs text-pirrot-blue-200/70">
            {suffix}
          </span>
        ) : null}
      </div>
      {error ? (
        <span className="text-xs text-amber-300">{error}</span>
      ) : changed ? (
        <span className="text-xs text-pirrot-blue-200/70">
          bisher {formatPriceFieldValue(savedValue, field.unit)}
        </span>
      ) : null}
    </label>
  );
}

function PricePreview({
  saved,
  draft,
}: {
  saved: PriceBook;
  draft: PriceBook | null;
}) {
  const [format, setFormat] = useState<PrintFormat>("DIN A5");
  const [grayscalePages, setGrayscalePages] = useState("160");
  const [colorPages, setColorPages] = useState("4");
  const [bindingKey, setBindingKey] = useState<BindingKey | "">(
    "kunststoffspirale",
  );

  const toPages = (value: string) => Math.max(0, Math.floor(Number(value) || 0));
  const sample = {
    format,
    grayscalePages: toPages(grayscalePages),
    colorPages: toPages(colorPages),
    bindingKey: bindingKey || null,
  };
  const quantities = [
    ...new Set([
      ...PREVIEW_QUANTITIES,
      saved.volume.bulkQuantity,
      ...(draft ? [draft.volume.bulkQuantity] : []),
    ]),
  ].sort((a, b) => a - b);

  return (
    <section className="glass-card-soft flex flex-col gap-4 p-5">
      <div>
        <h4 className="text-lg font-bold text-white">Vorschau</h4>
        <p className="mt-1 text-sm text-pirrot-blue-100/70">
          So viel kostet ein Beispielplaner im Shop: pro Planer und für die
          ganze Menge, ohne Versand.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
          Format
          <select
            value={format}
            onChange={(event) => setFormat(event.target.value as PrintFormat)}
            className="soft-input"
          >
            <option value="DIN A5">DIN A5</option>
            <option value="DIN A4">DIN A4</option>
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
          Bindung
          <select
            value={bindingKey}
            onChange={(event) => setBindingKey(event.target.value as BindingKey | "")}
            className="soft-input"
          >
            {BINDINGS.map((binding) => (
              <option key={binding.key} value={binding.key}>
                {binding.label}
              </option>
            ))}
            <option value="">Ohne Bindung</option>
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
          S/W-Seiten
          <input
            type="number"
            min={0}
            step={1}
            value={grayscalePages}
            onChange={(event) => setGrayscalePages(event.target.value)}
            className="soft-input"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
          Farbseiten
          <input
            type="number"
            min={0}
            step={1}
            value={colorPages}
            onChange={(event) => setColorPages(event.target.value)}
            className="soft-input"
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <thead>
            <tr className="border-b border-pirrot-blue-200/10 text-xs uppercase tracking-wide text-pirrot-blue-200/70">
              <th className="px-2 py-2 font-semibold">Menge</th>
              <th className="px-2 py-2 text-right font-semibold">Bisher</th>
              <th className="px-2 py-2 text-right font-semibold">Neu</th>
              <th className="px-2 py-2 text-right font-semibold">Gesamt neu</th>
            </tr>
          </thead>
          <tbody>
            {quantities.map((quantity) => {
              const before = quotePlanner({ ...sample, quantity }, saved);
              const after = draft ? quotePlanner({ ...sample, quantity }, draft) : null;
              const changed = after !== null && after.single !== before.single;
              return (
                <tr
                  key={quantity}
                  className="border-b border-pirrot-blue-200/5 text-pirrot-blue-50"
                >
                  <td className="px-2 py-2 font-semibold text-white">{quantity}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    {formatCents(before.single)}
                  </td>
                  <td
                    className={`whitespace-nowrap px-2 py-2 text-right ${changed ? "font-semibold text-white" : ""}`}
                  >
                    {after ? formatCents(after.single) : "–"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
                    {after ? formatCents(after.total) : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!draft ? (
        <p className="text-xs text-amber-300">
          Die neuen Preise erscheinen, sobald alle Felder gültig sind.
        </p>
      ) : null}
    </section>
  );
}

type PendingAction =
  | { kind: "save"; changes: PriceChange[] }
  | { kind: "restore"; versionId: number; changes: PriceChange[] };

export default function PriceEditor() {
  const utils = api.useUtils();
  const toast = useToast();
  const pricing = api.pricing.get.useQuery();

  const [baseVersionId, setBaseVersionId] = useState<number>();
  const [draft, setDraft] = useState<Draft>({});
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<PendingAction>();

  const current = pricing.data?.current;
  const history = pricing.data?.history ?? [];

  useEffect(() => {
    if (current && baseVersionId === undefined) {
      setBaseVersionId(current.id);
      setDraft(draftFromBook(current.priceBook));
    }
  }, [current, baseVersionId]);

  const parsed = useMemo(() => parseDraft(draft), [draft]);
  const changes = useMemo(
    () =>
      current && parsed.priceBook
        ? diffPriceBooks(current.priceBook, parsed.priceBook)
        : [],
    [current, parsed.priceBook],
  );

  function loadVersion(version: { id: number; priceBook: PriceBook }) {
    setBaseVersionId(version.id);
    setDraft(draftFromBook(version.priceBook));
    setNote("");
  }

  const onMutationSuccess = async (
    version: { id: number; priceBook: PriceBook },
    message: string,
  ) => {
    setPending(undefined);
    loadVersion(version);
    toast.show(message, "success");
    await utils.pricing.get.invalidate();
  };
  const onMutationError = async (error: { message: string }) => {
    setPending(undefined);
    toast.show(error.message, "error");
    await utils.pricing.get.invalidate();
  };

  const save = api.pricing.save.useMutation({
    onSuccess: (version) =>
      onMutationSuccess(version, `Version ${version.id} ist jetzt aktiv.`),
    onError: onMutationError,
  });
  const restore = api.pricing.restore.useMutation({
    onSuccess: (version) =>
      onMutationSuccess(
        version,
        `Version ${version.restoredFromId} wurde als Version ${version.id} wiederhergestellt.`,
      ),
    onError: onMutationError,
  });
  const isMutating = save.isPending || restore.isPending;

  if (pricing.isPending) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }
  if (pricing.isError || !current) {
    return (
      <div className="glass-card-soft p-5 text-sm text-amber-200">
        Die Preisdatenbank konnte nicht geöffnet werden: {pricing.error?.message}
      </div>
    );
  }

  const isOutdated = baseVersionId !== undefined && baseVersionId !== current.id;
  const canSave =
    !isOutdated && !isMutating && parsed.priceBook !== null && changes.length > 0;

  function confirmPending() {
    if (!pending || !current) return;
    if (pending.kind === "save" && parsed.priceBook) {
      save.mutate({
        baseVersionId: current.id,
        note: note.trim() || undefined,
        priceBook: parsed.priceBook,
      });
    } else if (pending.kind === "restore") {
      restore.mutate({ versionId: pending.versionId, baseVersionId: current.id });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="glass-card-soft flex flex-col gap-2 p-4 text-sm text-pirrot-blue-100/80 lg:flex-row lg:items-center lg:justify-between">
        <span>
          <span className="font-semibold text-white">Aktiv: Version {current.id}</span>{" "}
          seit {formatDateTime(current.createdAt)} ·{" "}
          {current.createdByName ?? "System"}
        </span>
        <span className="text-xs text-pirrot-blue-200/70">
          Der Shop übernimmt neue Preise innerhalb einer Minute. Bestehende
          Bestellungen behalten ihren Preis. Preisdatenbank angelegt am{" "}
          {formatDateTime(pricing.data.createdAt)}.
        </span>
      </div>

      {isOutdated ? (
        <div className="glass-card-soft flex flex-col gap-3 border-amber-400/30 p-4 text-sm text-amber-100 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Inzwischen ist Version {current.id} aktiv. Deine Eingaben beruhen
            auf Version {baseVersionId}.
          </span>
          <button
            type="button"
            className="btn-secondary gap-2 px-3 py-1.5 text-xs"
            onClick={() => loadVersion(current)}
          >
            <ArrowPathIcon className="size-4" />
            Version {current.id} laden
          </button>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) setPending({ kind: "save", changes });
          }}
        >
          {SECTIONS.map((section) => (
            <section key={section.title} className="glass-card-soft p-5">
              <h4 className="text-lg font-bold text-white">{section.title}</h4>
              <p className="mt-1 text-sm text-pirrot-blue-100/70">
                {section.description}
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                {section.fields.map((field) => (
                  <PriceInput
                    key={field.id}
                    fieldId={field.id}
                    label={field.label}
                    value={draft[field.id] ?? ""}
                    saved={current.priceBook}
                    error={parsed.errors[field.id]}
                    onChange={(value) =>
                      setDraft((previous) => ({ ...previous, [field.id]: value }))
                    }
                  />
                ))}
              </div>
            </section>
          ))}

          <section className="glass-card-soft flex flex-col gap-4 p-5 lg:flex-row lg:items-end">
            <label className="flex flex-1 flex-col gap-2 text-sm text-pirrot-blue-100/80">
              Notiz zur Änderung (optional)
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={500}
                placeholder="z. B. Papierpreise 2027"
                className="soft-input"
              />
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                className="btn-secondary gap-2"
                disabled={changes.length === 0 && Object.keys(parsed.errors).length === 0}
                onClick={() => loadVersion(current)}
              >
                <ArrowUturnLeftIcon className="size-4" />
                Verwerfen
              </button>
              <button type="submit" className="btn-primary gap-2" disabled={!canSave}>
                <CheckIcon className="size-4" />
                {changes.length > 0
                  ? `${changes.length} ${changes.length === 1 ? "Änderung" : "Änderungen"} speichern`
                  : "Keine Änderungen"}
              </button>
            </div>
          </section>
        </form>

        <div className="flex flex-col gap-6">
          <PricePreview saved={current.priceBook} draft={parsed.priceBook} />

          <section className="glass-card-soft flex flex-col gap-4 p-5">
            <h4 className="text-lg font-bold text-white">Verlauf</h4>
            <ol className="flex flex-col gap-4">
              {history.map((version, index) => {
                const previous = history[index + 1];
                const versionChanges = previous
                  ? diffPriceBooks(previous.priceBook, version.priceBook)
                  : [];
                return (
                  <li
                    key={version.id}
                    className="flex flex-col gap-2 border-b border-pirrot-blue-200/10 pb-4 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">
                          Version {version.id}
                          {version.id === current.id ? (
                            <span className="ml-2 rounded-full border border-success-400/25 bg-success-950/35 px-2 py-0.5 text-xs text-success-300">
                              Aktiv
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-pirrot-blue-200/70">
                          {formatDateTime(version.createdAt)} ·{" "}
                          {version.createdByName ?? "System"}
                        </p>
                      </div>
                      {version.id !== current.id ? (
                        <button
                          type="button"
                          className="btn-secondary shrink-0 px-3 py-1.5 text-xs"
                          disabled={isMutating}
                          onClick={() =>
                            setPending({
                              kind: "restore",
                              versionId: version.id,
                              changes: diffPriceBooks(
                                current.priceBook,
                                version.priceBook,
                              ),
                            })
                          }
                        >
                          Wiederherstellen
                        </button>
                      ) : null}
                    </div>
                    {version.note ? (
                      <p className="text-sm text-pirrot-blue-100/80">{version.note}</p>
                    ) : null}
                    {versionChanges.length > 0 ? (
                      <ChangeList changes={versionChanges} />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>

      <Modal selector="modal-hook" show={pending !== undefined}>
        <div className="fixed inset-0 z-[69] flex items-center justify-center bg-slate-950/80 p-4">
          <div className="glass-card w-full max-w-lg p-5">
            <h3 className="text-xl font-bold text-white">
              {pending?.kind === "restore"
                ? `Version ${pending.versionId} wiederherstellen?`
                : "Neue Preise speichern?"}
            </h3>
            <p className="mt-2 text-sm text-pirrot-blue-100/75">
              Die Preise gelten innerhalb einer Minute für alle neuen
              Bestellungen im Shop.
            </p>
            <div className="mt-4 max-h-64 overflow-y-auto">
              <ChangeList changes={pending?.changes ?? []} />
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="btn-secondary"
                disabled={isMutating}
                onClick={() => setPending(undefined)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn-primary gap-2"
                disabled={isMutating}
                onClick={confirmPending}
              >
                <CheckIcon className="size-4" />
                {isMutating ? "Speichert …" : "Ja, Preise aktivieren"}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
