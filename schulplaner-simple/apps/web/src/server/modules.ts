import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { PDFDocument } from "pdf-lib";
import { registry } from "pdf-pipeline";
import type { BookPart } from "db";
import { logger } from "@/lib/logger";

const run = promisify(execFile);

export const MODULE_KINDS = {
  umschlag: {
    label: "Umschlag",
    part: "COVER",
    rule: "genau 4 Seiten: U1, U2, U3, U4",
  },
  wochenplaner: {
    label: "Wochen-Doppelseite",
    part: "PLANNER",
    rule: "genau 2 Seiten, wird für jede Woche wiederholt",
  },
  inhalt: {
    label: "Inhaltsseiten",
    part: "DEFAULT",
    rule: "1 bis 100 Seiten, werden unverändert übernommen",
  },
} as const satisfies Record<string, { label: string; part: BookPart; rule: string }>;

export type ModuleKind = keyof typeof MODULE_KINDS;

export const MAX_MODULE_BYTES = 50 * 1024 * 1024;

// Placeholders come straight from the pipeline handlers, so the upload
// check always matches what generation fills in.
const fieldsOf = (moduleType: string) =>
  registry.get(moduleType)?.tags.map((tag) => tag.fieldName) ?? [];
const PLANNER_FIELDS = fieldsOf("wochenplaner");
const COVER_FIELDS = fieldsOf("umschlag");

function fieldNames(doc: PDFDocument) {
  try {
    return doc.getForm().getFields().map((field) => field.getName());
  } catch {
    return [];
  }
}

/**
 * Validate an uploaded module PDF against the handler it will run through.
 * Errors block the upload; notes describe which placeholders were found.
 */
export async function inspectModulePdf(bytes: Uint8Array, kind: ModuleKind) {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes);
  } catch {
    return { ok: false as const, error: "Die Datei ist kein lesbares PDF." };
  }
  const pageCount = doc.getPageCount();
  if (kind === "umschlag" && pageCount !== 4) {
    return { ok: false as const, error: `Ein Umschlag braucht genau 4 Seiten (hat ${pageCount}).` };
  }
  if (kind === "wochenplaner" && pageCount !== 2) {
    return { ok: false as const, error: `Die Wochen-Doppelseite braucht genau 2 Seiten (hat ${pageCount}).` };
  }
  if (kind === "inhalt" && (pageCount < 1 || pageCount > 100)) {
    return { ok: false as const, error: "Inhaltsseiten: 1 bis 100 Seiten erlaubt." };
  }

  const fields = new Set(fieldNames(doc));
  const notes: string[] = [];
  if (kind === "umschlag") {
    const found = COVER_FIELDS.filter((name) => fields.has(name));
    notes.push(
      found.length
        ? `Platzhalter: ${found.join(", ")}`
        : `Keine Platzhalter (${COVER_FIELDS.join(", ")}) – der Planertitel wird nicht aufgedruckt.`,
    );
  }
  if (kind === "wochenplaner") {
    const found = PLANNER_FIELDS.filter((name) => fields.has(name));
    if (found.length === 0) {
      return {
        ok: false as const,
        error: `Die Doppelseite hat keine Datumsfelder (${PLANNER_FIELDS.join(", ")}).`,
      };
    }
    notes.push(`Platzhalter: ${found.join(", ")}`);
  }
  return { ok: true as const, pageCount, notes };
}

/** First page as a small JPEG for the cover picker; null if poppler fails. */
export async function renderThumbnail(bytes: Uint8Array): Promise<Uint8Array | null> {
  const directory = await mkdtemp(join(tmpdir(), "planner-thumb-"));
  try {
    const input = join(directory, "module.pdf");
    await writeFile(input, bytes);
    // Fixed arguments only; no shell and no user-controlled parameters.
    await run(
      "pdftoppm",
      ["-f", "1", "-l", "1", "-singlefile", "-scale-to", "700", "-jpeg", "-jpegopt", "quality=80", input, join(directory, "thumb")],
      { timeout: 60_000 },
    );
    return new Uint8Array(await readFile(join(directory, "thumb.jpg")));
  } catch (error) {
    logger.warn("module_thumbnail_failed", { error });
    return null;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
