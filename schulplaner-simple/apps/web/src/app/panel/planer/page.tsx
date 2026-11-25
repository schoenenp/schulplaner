import { ArrowDown, ArrowUp, X } from "lucide-react";
import { fileUrl } from "@/lib/files";
import { PreviewPanel } from "@/components/preview-panel";
import { db } from "@/server/db";
import { getTemplate } from "@/server/settings";
import { createTemplate, moveTemplateModule, removeTemplateModule } from "./actions";
import { AddModuleForm, CoverSelect, TemplateInfoForm } from "./_components/template-forms";

export const metadata = { title: "Standardplaner" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  wochenplaner: "Wochen-Doppelseite · wird pro Woche wiederholt",
  inhalt: "Inhaltsseiten",
};

export default async function TemplatePage() {
  const template = await getTemplate();
  if (!template) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        <h1 className="text-3xl">Standardplaner</h1>
        <p className="text-muted">
          Der Standardplaner ist der eine feste Planer, den alle Schulen bestellen. Er wird wie bisher
          aus Modulen aufgebaut: ein Umschlag, dann die Inhalte in Druckreihenfolge.
        </p>
        <form action={createTemplate}>
          <button type="submit" className="btn-primary">Standardplaner anlegen</button>
        </form>
      </div>
    );
  }

  const modules = await db.module.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortIdx: "asc" }, { name: "asc" }],
    include: { type: true, files: { select: { pageCount: true } } },
  });
  const cover = template.modules.find((entry) => entry.module.part === "COVER");
  const content = template.modules.filter((entry) => entry.module.part !== "COVER").sort((a, b) => a.idx - b.idx);
  const contentIds = new Set(content.map((entry) => entry.moduleId));
  const weekModules = content.filter((entry) => entry.module.type.name === "wochenplaner").length;
  const fixedPages = content
    .filter((entry) => entry.module.type.name !== "wochenplaner")
    .reduce((sum, entry) => sum + (entry.module.files[0]?.pageCount ?? 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl">Standardplaner</h1>
        <p className="mt-1 max-w-3xl text-muted">
          Der feste Planer für alle Schulen. Schulen ändern nur Planerinfo, Termine und – falls gewünscht –
          den Umschlag. Änderungen hier gelten für alle noch nicht bestellten Planer; bestehende Bestellungen
          bleiben unverändert.
        </p>
      </div>

      {weekModules === 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Es ist noch keine Wochen-Doppelseite enthalten – ohne sie hat der Planer keine Wochenseiten und
          keine Termine.
        </p>
      )}

      <section className="card flex flex-col gap-4">
        <h2 className="text-lg">Grunddaten</h2>
        <TemplateInfoForm bookTitle={template.bookTitle ?? ""} format={template.format} />
      </section>

      <section className="card flex flex-col gap-4">
        <h2 className="text-lg">Aufbau in Druckreihenfolge</h2>
        <ol className="flex flex-col gap-2">
          <li className="flex items-center gap-3 rounded-lg border border-line p-3">
            {cover?.module.thumbnailSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl(cover.module.thumbnailSrc)} alt="" className="h-16 w-12 rounded border border-line object-cover" />
            )}
            <div className="flex-1">
              <p className="font-medium">Umschlag vorne (U1/U2) und hinten (U3/U4)</p>
              <p className="text-sm text-muted">{cover ? `Standard: ${cover.module.name}` : "Noch kein Umschlag gewählt"}</p>
            </div>
          </li>
          {content.map((entry, index) => (
            <li key={entry.id} className="flex items-center gap-3 rounded-lg border border-line p-3">
              <span className="w-6 text-center text-sm text-muted">{index + 1}</span>
              <div className="flex-1">
                <p className="font-medium">{entry.module.name}</p>
                <p className="text-sm text-muted">
                  {KIND_LABEL[entry.module.type.name] ?? entry.module.type.name}
                  {entry.module.type.name !== "wochenplaner" && ` · ${entry.module.files[0]?.pageCount ?? "?"} Seiten`}
                </p>
              </div>
              <form action={moveTemplateModule.bind(null, entry.id, -1)}>
                <button type="submit" disabled={index === 0} className="rounded p-1 hover:bg-paper disabled:opacity-30" aria-label="Nach oben">
                  <ArrowUp className="size-4" />
                </button>
              </form>
              <form action={moveTemplateModule.bind(null, entry.id, 1)}>
                <button type="submit" disabled={index === content.length - 1} className="rounded p-1 hover:bg-paper disabled:opacity-30" aria-label="Nach unten">
                  <ArrowDown className="size-4" />
                </button>
              </form>
              <form action={removeTemplateModule.bind(null, entry.id)}>
                <button type="submit" className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-700" aria-label="Entfernen">
                  <X className="size-4" />
                </button>
              </form>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">
          Feste Seiten: 4 Umschlagseiten + {fixedPages} Inhaltsseiten, dazu 2 Seiten pro Woche. Leerseiten
          werden für die Klammerheftung automatisch auf ein Vielfaches von 4 ergänzt.
        </p>
        <div className="grid gap-4 border-t border-line pt-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Standardumschlag</p>
            <CoverSelect
              current={cover?.moduleId}
              options={modules.filter((module) => module.part === "COVER").map((module) => ({ id: module.id, name: module.name }))}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">Inhalt ergänzen</p>
            <AddModuleForm
              options={modules
                .filter((module) => module.part !== "COVER" && !contentIds.has(module.id))
                .map((module) => ({
                  id: module.id,
                  name: module.name,
                  detail: module.type.name === "wochenplaner" ? "Wochen-Doppelseite" : `${module.files[0]?.pageCount ?? "?"} S.`,
                }))}
            />
          </div>
        </div>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="text-lg">Vorschau mit Beispieldaten</h2>
        <p className="text-sm text-muted">
          Standard-Schuljahr, Bundesland aus der Konfiguration, Untertitel „Musterschule“ und zwei Beispieltermine.
        </p>
        <PreviewPanel url="/api/panel/vorlage/vorschau" fullUrl="/api/panel/vorlage/vorschau?voll=1" />
      </section>
    </div>
  );
}
