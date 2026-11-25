import { brand } from "@/brand";
import { logger } from "@/lib/logger";
import { isStaffRole } from "@/server/access";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { withGenerationLock } from "@/server/generation-lock";
import { HOLIDAY_FAILURE_MESSAGE, isHolidayFailure } from "@/server/holidays";
import { pdfBookInclude, pdfResponse, renderPreview, renderPrintPdf, type PdfBook } from "@/server/pdf";
import { defaultPeriod, getShopSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function firstWeekday(from: Date, offsetDays: number) {
  const date = new Date(from.getTime() + offsetDays * 86_400_000);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

/**
 * The standard planner with sample school data: the default school year,
 * the brand's region and two sample dates. ?voll=1 builds the complete print
 * file (no watermark) to check page count and every week.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!isStaffRole(session?.user.role)) return new Response("Not found", { status: 404 });
  const full = new URL(request.url).searchParams.get("voll") === "1";
  const settings = await getShopSettings();
  const template = settings.templateBookId
    ? await db.book.findUnique({ where: { id: settings.templateBookId }, include: pdfBookInclude })
    : null;
  if (!template) return Response.json({ error: "Kein Standardplaner angelegt." }, { status: 404 });

  const period = defaultPeriod(settings);
  const sample: PdfBook = {
    ...template,
    subTitle: "Musterschule",
    country: brand.country,
    region: brand.region,
    planStart: period.start,
    planEnd: period.end,
    customDates: [
      { id: "sample-1", bookId: template.id, name: "Elternabend", date: firstWeekday(period.start, 9) },
      { id: "sample-2", bookId: template.id, name: "Wandertag", date: firstWeekday(period.start, 16) },
    ],
  };

  try {
    const result = await withGenerationLock(`template:${session!.user.id}`, async () => {
      if (full) {
        const print = await renderPrintPdf(sample);
        return { pdf: print.pdf, pages: print.pageCount };
      }
      const preview = await renderPreview(sample);
      return { pdf: preview.pdf, pages: preview.fullPageCount };
    });
    if (result.busy) return Response.json({ error: "Es läuft bereits eine Erstellung." }, { status: 429 });
    const response = pdfResponse(result.value.pdf, full ? "standardplaner-testdruck.pdf" : "standardplaner-vorschau.pdf");
    if (result.value.pages) response.headers.set("X-Print-Page-Count", String(result.value.pages));
    return response;
  } catch (error) {
    logger.error("template_preview_failed", { error });
    const message = isHolidayFailure(error)
      ? HOLIDAY_FAILURE_MESSAGE
      : error instanceof Error
        ? error.message
        : "Die Vorschau konnte nicht erstellt werden.";
    return Response.json({ error: message }, { status: 500 });
  }
}
