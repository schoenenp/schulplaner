/** Install immutable PDFs and replace the local standard planner's module list.
 * Run from project root: bun --env-file=apps/web/.env.local scripts/install-gold-modules.ts
 * --bootstrap initializes a fresh deployment without replacing a configured planner.
 */
import { readFile, writeFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { db } from "../packages/db/src/index";
import { uploadStorageFiles } from "../packages/storage/src/server";

const project = resolve(import.meta.dir, "..");
const bootstrap = process.argv.includes("--bootstrap");
const host = new URL(process.env.DATABASE_URL ?? "").hostname;
if (!bootstrap && (!["127.0.0.1", "localhost", "[::1]"].includes(host) || process.env.STORAGE_DRIVER !== "local")) {
  throw new Error("This setup command only installs into the local development environment.");
}
// .env.local is normally resolved from apps/web by Next, not the project root.
if (process.env.STORAGE_DRIVER === "local") {
  process.env.STORAGE_LOCAL_DIR = resolve(project, "apps/web", process.env.STORAGE_LOCAL_DIR || "../../.local-storage");
}
const definitions = [
  { file: "umschlag.pdf", name: "Standardumschlag Beige/Gold", type: "umschlag", part: "COVER" as const, description: "Beige/goldene Gestaltung mit abgesetztem Titelfeld für Planertitel und Schuljahr." },
  { file: "stundenplan.pdf", name: "Stundenplan · Beige/Gold", type: "inhalt", part: "DEFAULT" as const, description: "Zweiseitiger Stundenplan aus dem freigegebenen goldenen Entwurf." },
  { file: "meine-leistungen.pdf", name: "Meine Leistungen · Beige/Gold", type: "inhalt", part: "DEFAULT" as const, description: "Leistungsübersicht für beide Halbjahre." },
  { file: "wochenplan.pdf", name: "Wochenplan 2 · Beige/Gold", type: "wochenplaner", part: "PLANNER" as const, description: "Dynamische Hausaufgaben-Doppelseite mit Datum, Kalenderwoche, Ferien und Schulterminen." },
];
async function install() {
  const settings = await db.shopSettings.findUniqueOrThrow({ where: { id: "default" } });
  if (bootstrap && settings.templateBookId) {
    console.log("Standard planner already configured.");
    return;
  }
  const moduleIds: string[] = [];
  for (const item of definitions) {
    const data = new Uint8Array(await readFile(resolve(project, "modules/gold", item.file)));
    const digest = createHash("sha256").update(data).digest("hex").slice(0, 20);
    const id = `gold-${item.type}-${digest}`;
    const existing = await db.module.findUnique({ where: { id } });
    if (!existing) {
      const doc = await PDFDocument.load(data);
      const directory = await mkdtemp(join(tmpdir(), "gold-thumb-"));
      let thumbnail: Uint8Array;
      try {
        const input = join(directory, "input.pdf");
        await writeFile(input, data);
        execFileSync("pdftoppm", ["-f", "1", "-l", "1", "-singlefile", "-scale-to", "700", "-jpeg", input, join(directory, "thumb")]);
        thumbnail = new Uint8Array(await readFile(join(directory, "thumb.jpg")));
      } finally { await rm(directory, { recursive: true, force: true }); }
      const [pdf, thumb] = await uploadStorageFiles([{ data, name: item.file }, { data: thumbnail!, name: "thumbnail.jpg" }]);
      const type = await db.moduleType.findUniqueOrThrow({ where: { name: item.type } });
      await db.module.create({ data: {
        id, name: item.name, description: item.description, typeId: type.id, part: item.part,
        visible: "PRIVATE", sortIdx: 0, thumbnailSrc: thumb!.src,
        files: { create: { ...pdf!, pageCount: doc.getPageCount() } },
      } });
    }
    moduleIds.push(id);
  }
  const backupDir = resolve(project, "output/gold");
  await mkdir(backupDir, { recursive: true });
  if (settings.templateBookId) {
    const before = await db.book.findUniqueOrThrow({ where: { id: settings.templateBookId }, include: { modules: true } });
    // One separate backup per installation; no existing book or order is deleted.
    await writeFile(join(backupDir, `template-before-${Date.now()}.json`), JSON.stringify(before, null, 2));
  }
  const template = await db.$transaction(async tx => {
    if (bootstrap) {
      const current = await tx.shopSettings.findUniqueOrThrow({ where: { id: "default" } });
      if (current.templateBookId) return { id: current.templateBookId };
    }
    const book = settings.templateBookId
      ? await tx.book.findUniqueOrThrow({ where: { id: settings.templateBookId } })
      : await tx.book.create({ data: { name: "Standardplaner", bookTitle: "Mein Schulplaner", isTemplate: true, format: "A5" } });
    if (!book.isTemplate || book.frozenAt) throw new Error("Refusing to modify a non-template or frozen book.");
    await tx.bookModule.deleteMany({ where: { bookId: book.id } });
    await tx.bookModule.createMany({ data: moduleIds.map((moduleId, idx) => ({ bookId: book.id, moduleId, idx, colorCode: "COLOR" as const })) });
    await tx.book.update({ where: { id: book.id }, data: { name: "Standardplaner · Beige/Gold", bookTitle: "Mein Schulplaner", format: "A5" } });
    await tx.shopSettings.update({ where: { id: "default" }, data: { templateBookId: book.id } });
    await tx.module.updateMany({ where: { part: "COVER", visible: "PUBLIC" }, data: { visible: "PRIVATE" } });
    await tx.module.update({ where: { id: moduleIds[0] }, data: { visible: "PUBLIC" } });
    return book;
  }, bootstrap ? { isolationLevel: "Serializable" } : undefined);
  console.log(JSON.stringify({ templateId: template.id, modules: moduleIds }));
}

try { await install(); } finally { await db.$disconnect(); }
