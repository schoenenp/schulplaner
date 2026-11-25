import { ArrowDown, ArrowUp, FileText } from "lucide-react";
import { fileUrl } from "@/lib/files";
import { db } from "@/server/db";
import { getShopSettings } from "@/server/settings";
import { moveCover, setCoverOffered } from "./actions";
import { ArchiveButton } from "./_components/archive-button";
import { UploadForm } from "./_components/upload-form";

export const metadata = { title: "Module & Umschläge" };
export const dynamic = "force-dynamic";

export default async function ModulesPage() {
  const [modules, settings] = await Promise.all([
    db.module.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortIdx: "asc" }, { createdAt: "desc" }],
      include: { type: true, files: true, _count: { select: { books: { where: { book: { frozenAt: { not: null } } } } } } },
    }),
    getShopSettings(),
  ]);
  const templateModules = settings.templateBookId
    ? new Set(
        (await db.bookModule.findMany({ where: { bookId: settings.templateBookId }, select: { moduleId: true } })).map(
          (entry) => entry.moduleId,
        ),
      )
    : new Set<string>();
  const covers = modules.filter((module) => module.part === "COVER");
  const content = modules.filter((module) => module.part !== "COVER");

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl">Module & Umschläge</h1>
        <p className="mt-1 text-muted">
          Bausteine für den Standardplaner. Aufbau und Platzhalter sind dieselben wie im bisherigen
          Generator.
        </p>
      </div>
      <UploadForm />

      <section className="flex flex-col gap-3">
        <h2 className="text-xl">Umschläge</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {covers.map((cover, index) => (
            <div key={cover.id} className="card flex flex-col gap-2 p-3">
              {cover.thumbnailSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fileUrl(cover.thumbnailSrc)} alt="" className="aspect-[148/210] w-full rounded border border-line object-cover" />
              ) : (
                <div className="flex aspect-[148/210] items-center justify-center rounded border border-dashed border-line text-xs text-muted">
                  Kein Vorschaubild
                </div>
              )}
              <p className="text-sm font-medium">{cover.name}</p>
              <div className="flex flex-wrap gap-1 text-xs">
                {templateModules.has(cover.id) && <span className="rounded bg-brand-soft px-1.5 py-0.5 text-brand">Standard</span>}
                {cover.visible === "PUBLIC" ? (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-900">für Schulen</span>
                ) : (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">intern</span>
                )}
                {cover._count.books > 0 && <span className="text-muted">{cover._count.books}× bestellt</span>}
              </div>
              <form action={setCoverOffered.bind(null, cover.id, cover.visible !== "PUBLIC")}>
                <button type="submit" className="text-xs text-brand underline">
                  {cover.visible === "PUBLIC" ? "Für Schulen ausblenden" : "Für Schulen anbieten"}
                </button>
              </form>
              <div className="mt-auto flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  <form action={moveCover.bind(null, cover.id, -1)}>
                    <button type="submit" disabled={index === 0} className="rounded p-1 hover:bg-paper disabled:opacity-30" aria-label="Nach vorne">
                      <ArrowUp className="size-4" />
                    </button>
                  </form>
                  <form action={moveCover.bind(null, cover.id, 1)}>
                    <button type="submit" disabled={index === covers.length - 1} className="rounded p-1 hover:bg-paper disabled:opacity-30" aria-label="Nach hinten">
                      <ArrowDown className="size-4" />
                    </button>
                  </form>
                  {cover.files[0] && (
                    <a href={fileUrl(cover.files[0].src)} target="_blank" rel="noreferrer" className="rounded p-1 hover:bg-paper" aria-label="PDF öffnen">
                      <FileText className="size-4" />
                    </a>
                  )}
                </div>
                <ArchiveButton moduleId={cover.id} />
              </div>
            </div>
          ))}
          {covers.length === 0 && <p className="text-sm text-muted">Noch keine Umschläge.</p>}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl">Inhalte</h2>
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Art</th><th>Seiten</th><th>Im Standardplaner</th><th>Bestellt</th><th></th></tr>
            </thead>
            <tbody>
              {content.map((module) => (
                <tr key={module.id}>
                  <td>
                    <p className="font-medium">{module.name}</p>
                    {module.description && <p className="text-xs text-muted">{module.description}</p>}
                  </td>
                  <td>{module.type.name === "wochenplaner" ? "Wochen-Doppelseite" : "Inhaltsseiten"}</td>
                  <td>{module.files[0]?.pageCount ?? "–"}</td>
                  <td>{templateModules.has(module.id) ? "ja" : "–"}</td>
                  <td>{module._count.books}×</td>
                  <td className="flex items-center gap-3">
                    {module.files[0] && (
                      <a href={fileUrl(module.files[0].src)} target="_blank" rel="noreferrer" className="text-xs text-brand underline">PDF</a>
                    )}
                    <ArchiveButton moduleId={module.id} />
                  </td>
                </tr>
              ))}
              {content.length === 0 && (
                <tr><td colSpan={6} className="text-muted">Noch keine Inhalte.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
