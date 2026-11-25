import { fetchCdnAsset } from "./cdn-fetch";
import type { PDFDocument } from "pdf-lib";
import { logger } from "./logger";

/**
 * Add a watermark image to all pages. A requested watermark is required;
 * failures must not silently return an unwatermarked preview.
 */
export async function addWatermark(pdfDoc: PDFDocument): Promise<void> {
  const pages = pdfDoc.getPages();

  try {
    const pngUrl = "/assets/watermark.png";
    const response = await fetchCdnAsset(pngUrl);
    if (!response.ok)
      throw new Error(`Watermark download failed: HTTP ${response.status}`);
    const pngImageBytes = await response.arrayBuffer();
    const pngImage = await pdfDoc.embedPng(pngImageBytes);
    const pngDims = pngImage.scale(1.4);

    for (const page of pages) {
      page.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: pngDims.width,
        height: pngDims.height,
        opacity: 0.75,
      });
    }
  } catch (error) {
    logger.error("failed_to_add_pdf_watermark", { error });
    throw new Error(
      "Das Wasserzeichen konnte nicht hinzugefügt werden. Bitte versuchen Sie die PDF-Vorschau erneut zu erstellen.",
      { cause: error },
    );
  }
}
