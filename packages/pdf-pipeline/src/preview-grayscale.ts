import { PDFDocument } from "pdf-lib";

const PDFJS_CMAP_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/";
const PREVIEW_RASTER_SCALE = 0.9;
const PREVIEW_JPEG_QUALITY = 0.69;
const PREVIEW_FILTER = "grayscale(1) saturate(0.08) contrast(1.03)";

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
async function loadPdfJs(): Promise<typeof import("pdfjs-dist")> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  return pdfjs;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

async function canvasToJpegBytes(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (value) => resolve(value),
      "image/jpeg",
      quality,
    );
  });

  if (!blob) {
    throw new Error("Failed to rasterize preview canvas");
  }

  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Preview-only grayscale conversion.
 * Rasterizes each page, applies a saturation-reduced filter, then rebuilds
 * a low-quality image-based PDF for faster visual feedback.
 */
export async function convertPdfToPreviewGrayscale(
  pdfBytes: Uint8Array,
): Promise<Uint8Array> {
  if (!isBrowser()) {
    return pdfBytes;
  }

  const pdfjs = await loadPdfJs();

  const loadingTask = pdfjs.getDocument({
    data: pdfBytes,
    cMapUrl: PDFJS_CMAP_URL,
    cMapPacked: true,
  });

  const rendered = await loadingTask.promise;
  try {
    const rebuiltDoc = await PDFDocument.create();

    for (let index = 0; index < rendered.numPages; index += 1) {
      const page = await rendered.getPage(index + 1);
      const viewport = page.getViewport({ scale: PREVIEW_RASTER_SCALE });

      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = Math.max(1, Math.floor(viewport.width));
      sourceCanvas.height = Math.max(1, Math.floor(viewport.height));
      const sourceCtx = sourceCanvas.getContext("2d");
      if (!sourceCtx) {
        throw new Error("Failed to create preview raster context");
      }

      await page.render({
        canvasContext: sourceCtx,
        viewport,
        canvas: sourceCanvas,
      }).promise;

      const filteredCanvas = document.createElement("canvas");
      filteredCanvas.width = sourceCanvas.width;
      filteredCanvas.height = sourceCanvas.height;
      const filteredCtx = filteredCanvas.getContext("2d");
      if (!filteredCtx) {
        throw new Error("Failed to create filtered preview context");
      }

      filteredCtx.filter = PREVIEW_FILTER;
      filteredCtx.drawImage(sourceCanvas, 0, 0);

      const imageBytes = await canvasToJpegBytes(filteredCanvas, PREVIEW_JPEG_QUALITY);
      const image = await rebuiltDoc.embedJpg(imageBytes);

      const targetPage = rebuiltDoc.addPage([
        Math.max(1, viewport.width),
        Math.max(1, viewport.height),
      ]);
      targetPage.drawImage(image, {
        x: 0,
        y: 0,
        width: targetPage.getWidth(),
        height: targetPage.getHeight(),
      });

      page.cleanup();
    }

    return rebuiltDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50,
    });
  } finally {
    try {
      await rendered.cleanup();
    } catch {
      // no-op cleanup safeguard
    }
    try {
      await loadingTask.destroy();
    } catch {
      // no-op cleanup safeguard
    }
  }
}
