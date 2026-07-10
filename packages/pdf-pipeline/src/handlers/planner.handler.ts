import { PDFDocument } from "pdf-lib";
import { BaseHandler } from "./base.handler";
import type { TagDefinition, TagContext, HandlerResult } from "../types";
import { formatDate, generateWeekDates, fetchPdfBytesOrNull } from "../helpers";
import { getHolidays } from "../holidays";
import type { DateItem } from "../types";
import { normalizeDate } from "../helpers";
import { convertPdfToGrayscale } from "../grayscale";
import { convertPdfToPreviewGrayscale } from "../preview-grayscale";
import { estimatePlannerPageCount } from "./planner-page-count";
import {
  drawFieldText,
  getOverlayFont,
  readTemplateFieldSpecs,
} from "../template-overlay";

function formatGermanLongDate(date: Date, includeYear: boolean): string {
  const day = date.getDate().toString().padStart(2, "0");
  const month = date.toLocaleDateString("de-DE", { month: "long" });
  const yearSuffix = includeYear ? ` ${date.getFullYear()}` : "";
  return `${day}. ${month}${yearSuffix}`;
}

export function formatPlannerWeekRange(weekDates?: Date[]): string {
  const start = weekDates?.[0];
  const end = weekDates?.[4];

  if (!start || !end) return "";

  if (start.getFullYear() === end.getFullYear()) {
    return `${formatGermanLongDate(start, false)} bis ${formatGermanLongDate(
      end,
      true,
    )}`;
  }

  return `${formatGermanLongDate(start, true)} bis ${formatGermanLongDate(
    end,
    true,
  )}`;
}

export function getIsoWeekNumber(date: Date): number {
  const utcDate = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);

  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil(
    (((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7,
  );
}

/**
 * Handler for "wochenplaner" (weekly planner) modules.
 *
 * Planners are special modules that:
 * - Must have exactly 2 pages (one spread per week)
 * - Are duplicated for each week in the date range
 * - Include alignment pages for proper spread layout
 *
 * The template's two pages are embedded ONCE as form XObjects and every week
 * page just references them, drawing its dates/holidays as a text overlay at
 * the positions the template's form fields define. Compared to the previous
 * fill-and-flatten-per-week approach this stores the template's artwork a
 * single time instead of once per week (file size no longer grows with the
 * week count) and parses the template once instead of ~54 times. It also
 * means a grayscale planner needs exactly one small template conversion
 * instead of uploading every duplicated week to the grayscale API in batches.
 *
 * Available tags (repeated per week):
 * - xA, xB, xC, xD, xE: Day dates (Mon-Fri) formatted as DD.MM
 * - xA_Date, xB_Date, xC_Date, xD_Date, xE_Date: Holiday names for each day
 * - WEEK_FROMTO: Week range formatted as "01. Januar bis 05. Januar 2026"
 * - WEEK_NUM: ISO calendar week number for the current planner week
 *
 * To add more tags, add them to the tags array and implement
 * the value getter using the weekDates from context.
 */
class PlannerHandler extends BaseHandler {
  readonly moduleType = "wochenplaner";

  readonly tags: TagDefinition[] = [
    // Day date fields (Mon-Fri)
    { fieldName: "xA", getValue: (ctx) => this.formatDay(ctx, 0) },
    { fieldName: "xB", getValue: (ctx) => this.formatDay(ctx, 1) },
    { fieldName: "xC", getValue: (ctx) => this.formatDay(ctx, 2) },
    { fieldName: "xD", getValue: (ctx) => this.formatDay(ctx, 3) },
    { fieldName: "xE", getValue: (ctx) => this.formatDay(ctx, 4) },

    // Holiday name fields (Mon-Fri)
    { fieldName: "xA_Date", getValue: (ctx) => this.getHoliday(ctx, 0) },
    { fieldName: "xB_Date", getValue: (ctx) => this.getHoliday(ctx, 1) },
    { fieldName: "xC_Date", getValue: (ctx) => this.getHoliday(ctx, 2) },
    { fieldName: "xD_Date", getValue: (ctx) => this.getHoliday(ctx, 3) },
    { fieldName: "xE_Date", getValue: (ctx) => this.getHoliday(ctx, 4) },
    { fieldName: "WEEK_FROMTO", getValue: (ctx) => this.getWeekRange(ctx) },
    { fieldName: "WEEK_NUM", getValue: (ctx) => this.getWeekNumber(ctx) },

    // Add more planner tags here as needed:
    // { fieldName: "MONTH_NAME", getValue: (ctx) => this.getMonthName(ctx) },
  ];

  /**
   * Format a weekday date as DD.MM
   */
  private formatDay(ctx: TagContext, dayIndex: number): string {
    const date = ctx.weekDates?.[dayIndex];
    if (!date) return "";
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    return `${day}.${month}`;
  }

  /**
   * Get the holiday name for a specific day, if any
   */
  private getHoliday(ctx: TagContext, dayIndex: number): string {
    const date = ctx.weekDates?.[dayIndex];
    if (!date || !ctx.holidayMap) return "";
    return ctx.holidayMap.get(formatDate(date)) ?? "";
  }

  private getWeekRange(ctx: TagContext): string {
    return formatPlannerWeekRange(ctx.weekDates);
  }

  private getWeekNumber(ctx: TagContext): string {
    const weekStart = ctx.weekDates?.[0];
    if (!weekStart) return "";
    return `KW ${getIsoWeekNumber(weekStart).toString().padStart(2, "0")}`;
  }

  async process(
    context: TagContext,
    templateBytes: Uint8Array,
  ): Promise<HandlerResult> {
    const { bookDetails, finalPdf, previewMode, isGrayscale, grayscaleApiKey } =
      context;

    // Validate template and read field geometry from the original document;
    // grayscale conversion may strip the form data, the artwork source below
    // may therefore differ from the geometry source.
    const templateDoc = await PDFDocument.load(templateBytes);
    if (templateDoc.getPageCount() !== 2) {
      throw new Error("Planner module must have exactly 2 pages");
    }
    const fieldSpecs = readTemplateFieldSpecs(
      templateDoc,
      this.tags.map((tag) => tag.fieldName),
    );

    // Calculate date range
    const currentDate = new Date();
    const nextYearsDate = new Date(currentDate);
    nextYearsDate.setFullYear(currentDate.getFullYear() + 1);

    const startTime = bookDetails.period.start
      ? new Date(bookDetails.period.start)
      : new Date(currentDate);
    startTime.setDate(startTime.getDate() - 7);

    const endTime = bookDetails.period.end
      ? new Date(bookDetails.period.end)
      : new Date(nextYearsDate);

    // Build holiday map
    const holidayMap = await this.buildHolidayMap(
      bookDetails,
      startTime,
      endTime,
    );

    // Calculate weeks to process
    const diffTime = Math.abs(endTime.getTime() - startTime.getTime());
    const totalWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7));
    const weeksToProcess = previewMode
      ? Math.min(totalWeeks + 1, 4) // Limit to 4 weeks in preview
      : totalWeeks + 1;

    // Convert the template artwork once when the module is grayscale; every
    // duplicated week reuses the converted pages, so no batching is needed.
    // A print-quality variant stored at upload time takes precedence over
    // any conversion. Field geometry always comes from the original template.
    let artworkDoc = templateDoc;
    if (isGrayscale) {
      const variantDoc = await this.loadUsableVariant(
        context.moduleItem.grayscalePdfUrl,
      );
      if (variantDoc) {
        artworkDoc = variantDoc;
      } else {
        const artworkBytes = previewMode
          ? await convertPdfToPreviewGrayscale(templateBytes)
          : await convertPdfToGrayscale(templateBytes, {
              apiKey: grayscaleApiKey,
            });
        artworkDoc = await PDFDocument.load(artworkBytes);
      }
    }

    // Embed both spread pages once; each week page references these XObjects.
    // Pages without a Contents stream (blank template sides) stay blank —
    // pdf-lib embeds lazily at save time, so this must be checked up front.
    const spreadArt = await Promise.all(
      [0, 1].map(async (pageIndex) => {
        const artworkPage = artworkDoc.getPage(pageIndex);
        if (artworkPage.node.Contents() === undefined) return undefined;
        return finalPdf.embedPage(artworkPage);
      }),
    );

    // Week pages keep the original template dimensions even when the preview
    // rasterizer returns scaled-down pages; drawPage stretches them back.
    const pageSizes = templateDoc
      .getPages()
      .map((page) => ({ width: page.getWidth(), height: page.getHeight() }));

    const font = await getOverlayFont(finalPdf);
    let pagesAdded = 0;

    for (let weekIndex = 0; weekIndex < weeksToProcess; weekIndex++) {
      // Add alignment page if needed (planner spreads should start on odd pages)
      if (finalPdf.getPageCount() % 2 === 0) {
        const size = pageSizes[0]!;
        finalPdf.addPage([size.width, size.height]);
        pagesAdded++;
      }

      const weekDates = generateWeekDates(startTime, weekIndex);
      const weekContext: TagContext = {
        ...context,
        weekIndex,
        weekDates,
        holidayMap,
      };

      for (let pageIndex = 0; pageIndex < 2; pageIndex++) {
        const size = pageSizes[pageIndex]!;
        const page = finalPdf.addPage([size.width, size.height]);
        const art = spreadArt[pageIndex];
        if (art) {
          page.drawPage(art, {
            x: 0,
            y: 0,
            width: size.width,
            height: size.height,
          });
        }
        pagesAdded++;

        for (const tag of this.tags) {
          const specs = fieldSpecs.get(tag.fieldName);
          if (!specs) continue;
          const value = tag.getValue(weekContext);
          if (!value) continue;
          for (const spec of specs) {
            if (spec.pageIndex !== pageIndex) continue;
            drawFieldText(page, spec, value, font, {
              forceGrayscale: isGrayscale,
            });
          }
        }
      }
    }

    return { pagesAdded };
  }

  /**
   * Load the stored grayscale variant when it exists and still matches the
   * planner spread shape; anything else falls back to runtime conversion.
   */
  private async loadUsableVariant(
    grayscalePdfUrl: string | null | undefined,
  ): Promise<PDFDocument | undefined> {
    const variantBytes = await fetchPdfBytesOrNull(grayscalePdfUrl);
    if (!variantBytes) return undefined;
    try {
      const variantDoc = await PDFDocument.load(variantBytes);
      return variantDoc.getPageCount() === 2 ? variantDoc : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Build a map of dates to holiday names
   */
  private async buildHolidayMap(
    bookDetails: TagContext["bookDetails"],
    startTime: Date,
    endTime: Date,
  ): Promise<Map<string, string>> {
    let holidays: DateItem[] = [];

    if (bookDetails.addHolidays) {
      holidays = await getHolidays({
        code: bookDetails.code,
        country: bookDetails.country,
        start: startTime,
        end: endTime,
      });
    }

    // Merge custom dates
    if (bookDetails.customDates && bookDetails.customDates.length > 0) {
      const customEvents = bookDetails.customDates.map((d) => ({
        id: normalizeDate(d.date),
        name: d.name,
        date: normalizeDate(d.date),
      }));

      // Combine and sort by date
      holidays = [...holidays, ...customEvents].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
    }

    return new Map(holidays.map((h) => [h.date, h.name]));
  }

  async calculatePageCount(context: TagContext): Promise<number> {
    return estimatePlannerPageCount({
      periodStart: context.bookDetails.period.start,
      periodEnd: context.bookDetails.period.end,
      previewMode: context.previewMode,
      currentPageCount:
        context.currentPageCount ?? context.finalPdf.getPageCount(),
    });
  }
}

const plannerHandler = new PlannerHandler();
export default plannerHandler;
