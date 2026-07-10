import type { PDFDocument } from "pdf-lib";
import { logger } from "./logger";

/**
 * Add a watermark image to all pages in the PDF
 */
export async function addWatermark(pdfDoc: PDFDocument): Promise<void> {
  const pages = pdfDoc.getPages();

  try {
    const pngUrl = "/assets/watermark.png";
    const pngImageBytes = await fetch(pngUrl).then((res) => res.arrayBuffer());
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
  }
}
