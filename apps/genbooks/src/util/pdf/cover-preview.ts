import { PDFDocument } from "pdf-lib";
import { logger } from "@/util/logger";
import { pickModulePdfFile } from "@/util/module-files";

const CDN_URL = process.env.NEXT_PUBLIC_CDN_SERVER_URL ?? "";

interface CoverPreviewOptions {
  pdfUrl: string;
  bookTitle: string;
  yearStart: number;
  yearEnd?: number;
}

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
async function loadPdfJs(): Promise<typeof import("pdfjs-dist")> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  return pdfjs;
}

export async function generateCoverPreview(
  options: CoverPreviewOptions,
): Promise<string | null> {
  const { pdfUrl, bookTitle, yearStart, yearEnd } = options;

  try {
    const fullPdfUrl = pdfUrl.startsWith("http")
      ? pdfUrl
      : `${CDN_URL}${pdfUrl}`;
    const response = await fetch(fullPdfUrl);
    if (!response.ok) {
      logger.warn("cover_preview_pdf_fetch_failed", { status: response.status });
      return null;
    }
    const pdfBytes = await response.arrayBuffer();

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    const titleField = form.getTextField("BOOK_TITLE");
    if (titleField) {
      titleField.setText(bookTitle);
    }

    const yearRange =
      yearEnd && yearEnd !== yearStart
        ? `${yearStart}/${yearEnd}`
        : `${yearStart}`;
    const fromToField = form.getTextField("FROM_TO");
    if (fromToField) {
      fromToField.setText(yearRange);
    }

    form.flatten();

    const modifiedBytes = await pdfDoc.save();
    const pdfjs = await loadPdfJs();

    const loadingTask = pdfjs.getDocument({
      data: modifiedBytes,
      cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
      cMapPacked: true,
    });

    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);

    const scale = 1.5;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport,
      canvas,
    }).promise;

    return canvas.toDataURL("image/jpeg", 0.5);
  } catch (error) {
    logger.warn("cover_preview_generation_failed", { error });
    return null;
  }
}

export function getCoverThumbnail(
  modules: Array<{
    module: { files: Array<{ name?: string | null; src: string }> };
  } | null>,
): string | null {
  for (const mod of modules) {
    if (!mod?.module?.files) continue;
    const thumbFile = mod.module.files.find((f) =>
      f.name?.startsWith("thumb_"),
    );
    if (thumbFile) {
      return `${CDN_URL}${thumbFile.src}`;
    }
  }
  return null;
}

export function getCoverPdfUrl(
  modules: Array<{
    module: { files: Array<{ name?: string | null; src: string; type?: string }> };
  } | null>,
): string | null {
  for (const mod of modules) {
    if (!mod?.module?.files) continue;
    const pdfFile = pickModulePdfFile(mod.module.files);
    if (pdfFile) {
      return pdfFile.src;
    }
  }
  return null;
}
