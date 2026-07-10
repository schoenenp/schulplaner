import { cmyk, type PDFDocument, type PDFPage } from "pdf-lib";
import type { PageNumberOptions, RequiredPageNumberOptions } from "./types";

/**
 * Default page number options
 */
export const DEFAULT_PAGE_NUMBER_OPTIONS: RequiredPageNumberOptions = {
  fontSize: 9,
  color: { c: 0, m: 0, y: 0, k: 0.95 },
  position: "bottom-center",
  margin: 20,
};

/**
 * Add page numbers to all content pages (excluding cover pages)
 */
export function addPageNumbers(
  finalPdf: PDFDocument,
  options: PageNumberOptions = {},
): void {
  const mergedOptions: RequiredPageNumberOptions = {
    ...DEFAULT_PAGE_NUMBER_OPTIONS,
    ...options,
  };

  const allPages = finalPdf.getPages();
  // Skip first 2 (front cover) and last 2 (back cover) pages
  const contentPages = allPages.slice(2, -2);

  contentPages.forEach((page, idx) => {
    const pageNumber = idx + 1;
    // Alternate position based on odd/even page
    const position = pageNumber % 2 === 0 ? "bottom-left" : "bottom-right";
    addPageNumberToPage(page, pageNumber, {
      ...mergedOptions,
      position,
    });
  });
}

/**
 * Add a page number to a single page
 */
export function addPageNumberToPage(
  page: PDFPage,
  pageNumber: number,
  options: RequiredPageNumberOptions,
): void {
  const { width } = page.getArtBox();
  const { fontSize, color, position, margin } = options;

  const textWidth = pageNumber.toString().length * fontSize * 0.6;

  let x: number;
  const y = margin;

  switch (position) {
    case "bottom-left":
      x = margin;
      break;
    case "bottom-right":
      x = width - margin - textWidth;
      break;
    case "bottom-center":
    default:
      x = width / 2 - textWidth / 2;
      break;
  }

  page.drawText(pageNumber.toString(), {
    x,
    y,
    size: fontSize,
    color: cmyk(color.c, color.m, color.y, color.k),
  });
}
