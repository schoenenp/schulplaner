import { PDFDocument } from "pdf-lib";
import type { BookFormat } from "./types";
import { logger } from "./logger";

/**
 * Format a Date object to YYYY-MM-DD string
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Normalize a date string by extracting just the date part (before 'T')
 */
export function normalizeDate(dateStr: string | undefined): string {
  if (!dateStr) return "";
  const parts = dateStr.split("T");
  return parts[0] ?? "";
}

/**
 * Generate an array of weekday dates (Mon-Fri) for a given week index
 */
export function generateWeekDates(startDate: Date, weekIndex: number): Date[] {
  const dates: Date[] = [];
  const weekStart = new Date(startDate);
  weekStart.setDate(startDate.getDate() + weekIndex * 7);

  // Adjust to Monday
  const dayOfWeek = weekStart.getDay();
  const adjustment = dayOfWeek === 0 ? 1 : 1 - dayOfWeek;
  weekStart.setDate(weekStart.getDate() + adjustment);

  // Generate Mon-Fri
  for (let i = 0; i < 5; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    dates.push(date);
  }

  return dates;
}

/**
 * Fetch PDF bytes from a URL, with fallback to blank page on error
 */
export async function fetchPdfBytes(url: string): Promise<Uint8Array> {
  if (!url || url === "notizen.pdf" || url.trim() === "") {
    logger.warn("invalid_pdf_url_fallback_blank_page", { url });
    return getBlankPagePdfBytes();
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn("pdf_fetch_failed_fallback_blank_page", {
        url,
        status: response.status,
      });
      return getBlankPagePdfBytes();
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    logger.warn("pdf_fetch_error_fallback_blank_page", {
      url,
      error,
    });
    return getBlankPagePdfBytes();
  }
}

/**
 * Fetch PDF bytes from a URL, returning undefined on any failure.
 * Used for optional resources (like stored grayscale variants) where the
 * caller has a better fallback than a blank page.
 */
export async function fetchPdfBytesOrNull(
  url: string | null | undefined,
): Promise<Uint8Array | undefined> {
  if (!url || url.trim() === "") return undefined;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      logger.warn("optional_pdf_fetch_failed", { url, status: response.status });
      return undefined;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    logger.warn("optional_pdf_fetch_error", { url, error });
    return undefined;
  }
}

/**
 * Generate a blank A4 PDF page
 */
export async function getBlankPagePdfBytes(): Promise<Uint8Array> {
  const blankPdf = await PDFDocument.create();
  const a4Width = (210 / 25.4) * 72;
  const a4Height = (297 / 25.4) * 72;
  blankPdf.addPage([a4Width, a4Height]);
  return blankPdf.save();
}

/**
 * Standard A4 dimensions with bleeding for print
 */
export const PAGE_DIMENSIONS = {
  /** A4 width in points */
  A4_WIDTH: (210 / 25.4) * 72,
  /** A4 height in points */
  A4_HEIGHT: (297 / 25.4) * 72,
  /** A5 width in points */
  A5_WIDTH: (148 / 25.4) * 72,
  /** A5 height in points */
  A5_HEIGHT: (210 / 25.4) * 72,
  /** Standard bleeding in points (6mm) */
  BLEEDING: (6 / 25.4) * 72,
} as const;

export function getPageSizeWithBleed(
  format: BookFormat,
): { width: number; height: number } {
  if (format === "DIN A4") {
    return {
      width: PAGE_DIMENSIONS.A4_WIDTH + PAGE_DIMENSIONS.BLEEDING,
      height: PAGE_DIMENSIONS.A4_HEIGHT + PAGE_DIMENSIONS.BLEEDING,
    };
  }

  return {
    width: PAGE_DIMENSIONS.A5_WIDTH + PAGE_DIMENSIONS.BLEEDING,
    height: PAGE_DIMENSIONS.A5_HEIGHT + PAGE_DIMENSIONS.BLEEDING,
  };
}

/**
 * Get A4 dimensions with bleeding
 */
export function getA4WithBleeding(): { width: number; height: number } {
  return getPageSizeWithBleed("DIN A4");
}
