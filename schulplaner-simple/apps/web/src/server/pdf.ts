import "server-only";
/**
 * App wrapper around the shared pdf-pipeline package: wires the logger and
 * holiday lookup, and maps a Book with its modules to the pipeline input the
 * same way genbooks and panel_books do.
 */
import {
  processPdfModules,
  processPdfModulesPreview,
  setHolidayProvider,
  setPdfPipelineLogger,
  type BookDetails,
  type BookFormat,
  type ColorCode,
  type PDFModule,
} from "pdf-pipeline";
import { renderWatermarkedModulePreview } from "pdf-pipeline/server-preview";
import type { Prisma } from "db";
import { logger } from "@/lib/logger";
import { getHolidays } from "@/server/holidays";

setPdfPipelineLogger(logger);
setHolidayProvider(getHolidays);

export const pdfBookInclude = {
  customDates: { orderBy: { date: "asc" } },
  modules: {
    orderBy: { idx: "asc" },
    include: { module: { include: { type: true, files: true } } },
  },
} satisfies Prisma.BookInclude;

export type PdfBook = Prisma.BookGetPayload<{ include: typeof pdfBookInclude }>;

export type PdfSource = {
  bookDetails: BookDetails;
  modules: PDFModule[];
  colorMap: Map<string, ColorCode>;
  format: BookFormat;
};

const COVER_MODULE_IDX = -1;

function pickPdfFile(files: PdfBook["modules"][number]["module"]["files"]) {
  return files.find((file) => file.type === "PDF");
}

export function toPdfSource(book: PdfBook): PdfSource {
  const cover = book.modules.find((entry) => entry.module.part === "COVER");
  if (!cover) throw new Error("Der Planer hat keinen Umschlag.");
  const coverFile = pickPdfFile(cover.module.files);
  if (!coverFile) throw new Error("Der Umschlag hat keine PDF-Datei.");

  const content = book.modules
    .filter((entry) => entry.module.part !== "COVER")
    .sort((a, b) => a.idx - b.idx);
  if (content.length === 0) throw new Error("Der Planer hat keine Inhalte.");

  const colorMap = new Map<string, ColorCode>();
  const modules: PDFModule[] = content.map((entry, idx) => {
    const file = pickPdfFile(entry.module.files);
    if (!file) {
      throw new Error(`Modul "${entry.module.name}" hat keine PDF-Datei.`);
    }
    colorMap.set(entry.module.id, entry.colorCode === "GRAYSCALE" ? 1 : 4);
    return {
      id: entry.module.id,
      name: entry.module.name,
      idx,
      type: entry.module.type.name.toLowerCase(),
      pdfUrl: file.src,
      pageCount: file.pageCount,
    };
  });
  colorMap.set(cover.module.id, cover.colorCode === "GRAYSCALE" ? 1 : 4);
  modules.push({
    id: cover.module.id,
    name: cover.module.name,
    idx: COVER_MODULE_IDX,
    type: "umschlag",
    pdfUrl: coverFile.src,
    pageCount: coverFile.pageCount,
  });

  return {
    format: book.format.includes("A4") ? "DIN A4" : "DIN A5",
    colorMap,
    modules,
    bookDetails: {
      title: book.bookTitle ?? "Schulplaner",
      subtitle: book.subTitle,
      code: book.region ?? undefined,
      country: book.country,
      addHolidays: true,
      period: { start: book.planStart, end: book.planEnd ?? undefined },
      customDates: book.customDates.map(({ date, name }) => ({
        date: date.toISOString(),
        name,
      })),
    },
  };
}

/**
 * Watermarked, rasterized preview with the first weeks only (pipeline
 * preview mode). Returns the page count of the full print file as well.
 */
export async function renderPreview(book: PdfBook) {
  const source = toPdfSource(book);
  const result = await processPdfModulesPreview(
    source.bookDetails,
    source.modules,
    {
      format: source.format,
      colorMap: source.colorMap,
      // The pipeline's image watermark is fetched by URL; the rasterized
      // server preview stamps its own text watermark instead.
      addWatermark: false,
    },
  );
  const pdf = await renderWatermarkedModulePreview(result.pdfFile);
  return { pdf, fullPageCount: result.details.fullPageCount ?? null };
}

/** Print-ready file, built exactly like the panel's fulfillment download. */
export async function renderPrintPdf(book: PdfBook) {
  const source = toPdfSource(book);
  const result = await processPdfModules(source.bookDetails, source.modules, {
    format: source.format,
    colorMap: source.colorMap,
  });
  return {
    pdf: result.pdfFile,
    pageCount: result.details.pageCount ?? null,
    checks: result.details.checks ?? [],
  };
}

export function pdfResponse(pdf: Uint8Array, fileName: string, inline = true) {
  return new Response(pdf as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName.replace(/[^\w.-]+/g, "_")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
