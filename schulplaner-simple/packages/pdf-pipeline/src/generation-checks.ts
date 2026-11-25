import type { PDFDocument } from "pdf-lib";
import { getPageSizeWithBleed, PAGE_DIMENSIONS } from "./helpers";
import type { BookFormat, GenerationCheck } from "./types";

/** Inspect actual page boxes; selected format alone is not evidence of size. */
export function checkPageFormat(
  document: PDFDocument,
  format: BookFormat,
): GenerationCheck {
  const trim =
    format === "DIN A4"
      ? { width: PAGE_DIMENSIONS.A4_WIDTH, height: PAGE_DIMENSIONS.A4_HEIGHT }
      : { width: PAGE_DIMENSIONS.A5_WIDTH, height: PAGE_DIMENSIONS.A5_HEIGHT };
  const bleed = getPageSizeWithBleed(format);
  const mismatches: number[] = [];
  document.getPages().forEach((page, index) => {
    const box = page.getTrimBox();
    const matches = [trim, bleed].some(
      (size) =>
        Math.abs(box.width - size.width) <= 1 &&
        Math.abs(box.height - size.height) <= 1,
    );
    if (!matches) mismatches.push(index + 1);
  });
  return {
    code: "page-format",
    status: mismatches.length ? "warning" : "passed",
    message: mismatches.length
      ? `${mismatches.length} PDF-Seiten entsprechen nicht ${format} (Seite ${mismatches.slice(0, 5).join(", ")}${mismatches.length > 5 ? ", …" : ""}). Bitte lassen Sie das Druckformat vom Partner prüfen.`
      : `Die PDF-Seiten entsprechen ${format}, mit oder ohne Beschnitt.`,
  };
}
