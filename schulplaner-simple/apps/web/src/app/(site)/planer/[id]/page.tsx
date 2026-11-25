import { PlannerWizard } from "../_components/planner-wizard";
import { CoverUpload } from "../_components/cover-upload";
import { notFound } from "next/navigation";
import { Check, Trash2 } from "lucide-react";
import { brand } from "@/brand";
import { germanDate } from "@/lib/format";
import { fileUrl } from "@/lib/files";
import { regionName } from "@/lib/regions";
import { requireUser } from "@/server/access";
import { getHolidays } from "@/server/holidays";
import { findOwnPlanner, resolvePlannerCover } from "@/server/planner";
import { getTemplate, listCoverChoices } from "@/server/settings";
import { chooseCover, removeCustomDate } from "../actions";
import { DateForm } from "../_components/date-form";
import { InfoForm } from "../_components/info-form";
import { PreviewPanel } from "@/components/preview-panel";

export const metadata = { title: "Planer gestalten" };

async function loadHolidays(planner: { country: string; region: string | null; planStart: Date; planEnd: Date | null }) {
  if (!planner.planEnd) return { items: [], error: null };
  // Same window the week handler looks up: one week before the start.
  const start = new Date(planner.planStart);
  start.setDate(start.getDate() - 7);
  try {
    const items = await getHolidays({
      country: planner.country,
      code: planner.region ?? undefined,
      start,
      end: planner.planEnd,
    });
    return { items, error: null };
  } catch (error) {
    return { items: [], error: error instanceof Error ? error.message : String(error) };
  }
}

function Step({ number, title, hint, children }: { number: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="wizard-card flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white">
          {number}
        </span>
        <div>
          <h2 className="text-3xl md:text-4xl">{title}</h2>
          {hint && <p className="text-sm text-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export default async function PlannerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/planer/${id}`);
  const planner = await findOwnPlanner(user.id, id);
  if (!planner) notFound();

  const [template, covers, holidays] = await Promise.all([
    getTemplate(),
    listCoverChoices(),
    loadHolidays(planner),
  ]);
  const templateCoverEntry = template?.modules.find((entry) => entry.module.part === "COVER");
  const templateCover = templateCoverEntry?.module;
  const currentCover = resolvePlannerCover(planner, templateCoverEntry)?.module;
  const coverOptions = [
    ...(templateCover ? [{ ...templateCover, isDefault: true }] : []),
    ...covers.filter((cover) => cover.id !== templateCover?.id).map((cover) => ({ ...cover, isDefault: false })),
  ];

  return (
    <PlannerWizard bookId={planner.id}>
          <Step number={1} title="Euer Jahr. Euer Planer." hint="Auf dem Standardumschlag stehen Titel und Schuljahr. Das Bundesland bestimmt die Ferien und Feiertage.">
            <InfoForm
              bookId={planner.id}
              initial={{
                bookTitle: planner.bookTitle ?? "",
                subTitle: planner.subTitle ?? "",
                region: planner.region ?? brand.region,
                planStart: planner.planStart.toISOString().slice(0, 10),
                planEnd: planner.planEnd?.toISOString().slice(0, 10) ?? "",
              }}
            />
          </Step>

          <Step
            number={2}
            title="Platz für eure Highlights."
            hint="Ihr könnt von Montag bis Freitag einen eigenen Termin pro Tag eintragen. Fällt er auf einen Feiertag, stehen beide in der Wochenseite."
          >
            {planner.customDates.length > 0 ? (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {planner.customDates.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span>
                      <span className="inline-block w-24 font-medium tabular-nums">{germanDate(entry.date)}</span>
                      {entry.name}
                    </span>
                    <form action={removeCustomDate.bind(null, planner.id, entry.id)}>
                      <button type="submit" className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-700" aria-label={`${entry.name} entfernen`}>
                        <Trash2 className="size-4" />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Noch keine eigenen Termine.</p>
            )}
            <DateForm bookId={planner.id} />
            <details className="rounded-lg bg-paper p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Automatisch eingetragen: Ferien und Feiertage ({regionName(planner.region)})
                {holidays.items.length > 0 && ` – ${holidays.items.length} Einträge`}
              </summary>
              {holidays.error ? (
                <p className="mt-2 text-amber-800">{holidays.error}</p>
              ) : (
                <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                  {holidays.items.map((item) => (
                    <li key={`${item.date}-${item.name}`} className="text-muted">
                      <span className="inline-block w-24 tabular-nums">{germanDate(`${item.date}T12:00:00Z`)}</span>
                      {item.name}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </Step>

          <Step number={3} title="Außen ganz ihr." hint="Ein fertiges Motiv, euer Lieblingsbild oder ein eigener vierseitiger PDF-Umschlag.">
            <CoverUpload bookId={planner.id} currentName={currentCover?.name ?? "Standard"} thumbnail={currentCover?.thumbnailSrc ? fileUrl(currentCover.thumbnailSrc) : null} />
            <h3 className="text-lg">Oder ein fertiges Motiv wählen</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {coverOptions.map((cover) => {
                const selected = currentCover?.id === cover.id;
                return (
                  <form key={cover.id} action={chooseCover.bind(null, planner.id, cover.isDefault ? null : cover.id)}>
                    <button
                      type="submit"
                      disabled={selected}
                      aria-pressed={selected}
                      className={`group flex w-full flex-col gap-2 rounded-xl border-2 p-2 text-left transition ${
                        selected ? "border-brand bg-brand-soft" : "border-transparent hover:border-line"
                      }`}
                    >
                      {cover.thumbnailSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={fileUrl(cover.thumbnailSrc)}
                          alt=""
                          className="aspect-[148/210] w-full rounded-md border border-line object-cover"
                        />
                      ) : (
                        <span className="flex aspect-[148/210] w-full items-center justify-center rounded-md border border-dashed border-line text-xs text-muted">
                          Keine Abbildung
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-sm font-medium">
                        {selected && <Check className="size-4 text-brand" />}
                        {cover.name}
                      </span>
                      {cover.isDefault && <span className="hint">Standard</span>}
                    </button>
                  </form>
                );
              })}
            </div>
          </Step>

          <Step number={4} title="Sieht nach eurem Jahr aus." hint="Die Vorschau zeigt Umschlag, Inhalt und die ersten Wochen mit Ihren Daten – mit Wasserzeichen und in reduzierter Auflösung.">
            <PreviewPanel key={`${planner.updatedAt.toISOString()}-${currentCover?.id}-${planner.customDates.map(d => d.id).join(",")}`} url={`/api/planer/${planner.id}/vorschau`} />
          </Step>
    </PlannerWizard>
  );
}
