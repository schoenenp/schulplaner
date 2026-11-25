import { describe, expect, it } from "bun:test";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
  rgb,
} from "pdf-lib";
import {
  mergePlannerDateEntries,
  normalizePlannerDateKey,
} from "./planner-date-merge";
import { estimatePlannerPageCount } from "./planner-page-count";
import plannerHandler, {
  formatPlannerWeekRange,
  getIsoWeekNumber,
} from "./planner.handler";
import type { TagContext } from "../types";

describe("normalizePlannerDateKey", () => {
  it("normalizes timestamps to YYYY-MM-DD", () => {
    expect(normalizePlannerDateKey("2026-08-24T10:20:30.000Z")).toBe(
      "2026-08-24",
    );
  });

  it("rejects unsupported formats", () => {
    expect(normalizePlannerDateKey("2026/08/24")).toBeNull();
    expect(normalizePlannerDateKey("24-08-2026")).toBeNull();
  });

  it("rejects impossible calendar dates", () => {
    expect(normalizePlannerDateKey("2026-02-29")).toBeNull();
    expect(normalizePlannerDateKey("2026-13-01")).toBeNull();
    expect(normalizePlannerDateKey("2026-04-31")).toBeNull();
  });
});

describe("mergePlannerDateEntries", () => {
  it("normalizes holiday dates containing a timestamp", () => {
    const merged = mergePlannerDateEntries([
      { date: "2026-08-24T00:00:00.000Z", name: "Feiertag" },
    ]);

    expect(merged.get("2026-08-24")).toBe("Feiertag");
    expect(merged.size).toBe(1);
  });

  it("lets custom dates override holidays on the same day", () => {
    const merged = mergePlannerDateEntries(
      [{ date: "2026-12-24", name: "Heiligabend" }],
      [{ date: "2026-12-24T09:30:00.000Z", name: "Weihnachtsfeier" }],
    );

    expect(merged.get("2026-12-24")).toBe("Weihnachtsfeier");
    expect(merged.size).toBe(1);
  });

  it("keeps both entries when custom date does not collide", () => {
    const merged = mergePlannerDateEntries(
      [{ date: "2026-05-01", name: "Tag der Arbeit" }],
      [{ date: "2026-05-02", name: "Sportfest" }],
    );

    expect(merged.get("2026-05-01")).toBe("Tag der Arbeit");
    expect(merged.get("2026-05-02")).toBe("Sportfest");
    expect(merged.size).toBe(2);
  });

  it("skips entries that normalize to empty keys", () => {
    const merged = mergePlannerDateEntries(
      [{ date: "T00:00:00.000Z", name: "Broken holiday" }],
      [{ date: "T12:00:00.000Z", name: "Broken custom date" }],
    );

    expect(merged.size).toBe(0);
  });

  it("keeps last custom entry for duplicate custom dates", () => {
    const merged = mergePlannerDateEntries([], [
      { date: "2026-10-10", name: "Event A" },
      { date: "2026-10-10T14:00:00.000Z", name: "Event B" },
    ]);

    expect(merged.get("2026-10-10")).toBe("Event B");
    expect(merged.size).toBe(1);
  });

  it("applies the same date-format validation path to holidays and custom dates", () => {
    const merged = mergePlannerDateEntries(
      [
        { date: "2026/12/24", name: "Invalid holiday format" },
        { date: "2026-12-24T00:00:00.000Z", name: "Valid holiday timestamp" },
      ],
      [
        { date: "24-12-2026", name: "Invalid custom format" },
        { date: "2026-12-25T13:00:00.000Z", name: "Valid custom timestamp" },
      ],
    );

    expect(merged.get("2026-12-24")).toBe("Valid holiday timestamp");
    expect(merged.get("2026-12-25")).toBe("Valid custom timestamp");
    expect(merged.size).toBe(2);
  });
});

describe("planner page count estimation", () => {
  it("includes alignment pages when module starts on an even page", () => {
    const pageCount = estimatePlannerPageCount({
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-01-01T00:00:00.000Z"),
      currentPageCount: 4,
      previewMode: false,
    });

    expect(pageCount).toBe(5);
  });

  it("omits initial alignment when module starts on an odd page", () => {
    const pageCount = estimatePlannerPageCount({
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-01-01T00:00:00.000Z"),
      currentPageCount: 5,
      previewMode: false,
    });

    expect(pageCount).toBe(4);
  });

  it("caps estimation to preview week limits when previewMode is enabled", () => {
    const pageCount = estimatePlannerPageCount({
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-04-01T00:00:00.000Z"),
      currentPageCount: 4,
      previewMode: true,
    });

    expect(pageCount).toBe(9);
  });
});

describe("planner week tags", () => {
  it("formats the planner week range in German long-date form", () => {
    const weekDates = [
      new Date(2026, 0, 1),
      new Date(2026, 0, 2),
      new Date(2026, 0, 3),
      new Date(2026, 0, 4),
      new Date(2026, 0, 5),
    ];

    expect(formatPlannerWeekRange(weekDates)).toBe(
      "01. Januar bis 05. Januar 2026",
    );
  });

  it("includes the year on both sides when the planner week crosses a year boundary", () => {
    const weekDates = [
      new Date(2025, 11, 29),
      new Date(2025, 11, 30),
      new Date(2025, 11, 31),
      new Date(2026, 0, 1),
      new Date(2026, 0, 2),
    ];

    expect(formatPlannerWeekRange(weekDates)).toBe(
      "29. Dezember 2025 bis 02. Januar 2026",
    );
  });

  it("returns ISO calendar week numbers for planner weeks", () => {
    expect(getIsoWeekNumber(new Date(2025, 11, 29))).toBe(1);
    expect(getIsoWeekNumber(new Date(2026, 0, 5))).toBe(2);
  });
});

// --- Integration tests for the embed-once planner pipeline ---

async function buildPlannerTemplate(
  options: { artRects?: number } = {},
): Promise<Uint8Array> {
  // At least one drawn shape per page: real templates always carry artwork,
  // and pages without a Contents stream cannot become XObjects.
  const artRects = Math.max(1, options.artRects ?? 1);
  const doc = await PDFDocument.create();
  const pageA = doc.addPage([612, 792]);
  const pageB = doc.addPage([612, 792]);

  // Deterministic pseudo-random art so heavy templates get a poorly
  // compressible content stream like a designed planner spread.
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (const page of [pageA, pageB]) {
    for (let i = 0; i < artRects; i++) {
      page.drawRectangle({
        x: rand() * 590,
        y: rand() * 770,
        width: rand() * 12 + 1,
        height: rand() * 12 + 1,
        color: rgb(rand(), rand(), rand()),
      });
    }
  }

  const form = doc.getForm();
  ["xA", "xB", "xC", "xD", "xE"].forEach((name, idx) => {
    const day = form.createTextField(name);
    day.addToPage(pageA, {
      x: 30 + idx * 110,
      y: 700,
      width: 90,
      height: 16,
      borderWidth: 0,
    });
    day.setFontSize(9);
    const holiday = form.createTextField(`${name}_Date`);
    holiday.addToPage(pageA, {
      x: 30 + idx * 110,
      y: 676,
      width: 90,
      height: 14,
      borderWidth: 0,
    });
    holiday.setFontSize(7);
  });
  const fromTo = form.createTextField("WEEK_FROMTO");
  fromTo.addToPage(pageB, {
    x: 30,
    y: 750,
    width: 240,
    height: 16,
    borderWidth: 0,
  });
  fromTo.setFontSize(10);
  const weekNum = form.createTextField("WEEK_NUM");
  weekNum.addToPage(pageB, {
    x: 500,
    y: 750,
    width: 80,
    height: 16,
    borderWidth: 0,
  });
  weekNum.setFontSize(10);

  return doc.save({ useObjectStreams: false });
}

function makePlannerContext(
  finalPdf: PDFDocument,
  overrides: Partial<TagContext> = {},
): TagContext {
  return {
    bookDetails: {
      title: "Testplaner",
      addHolidays: false,
      period: {
        start: new Date("2026-09-07T00:00:00.000Z"),
        end: new Date("2026-11-27T00:00:00.000Z"),
      },
      customDates: [{ date: "2026-09-09", name: "Projekttag" }],
    },
    moduleItem: { id: "m1", type: "wochenplaner", idx: 1, pdfUrl: "" },
    finalPdf,
    format: "DIN A5",
    previewMode: false,
    isGrayscale: false,
    ...overrides,
  };
}

function decodeContentStreams(doc: PDFDocument): string {
  let out = "";
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    if (!contents) continue;
    const streams =
      contents instanceof PDFArray
        ? Array.from({ length: contents.size() }, (_, i) => contents.lookup(i))
        : [contents];
    for (const stream of streams) {
      if (stream instanceof PDFRawStream) {
        out += new TextDecoder("latin1").decode(
          decodePDFRawStream(stream).decode(),
        );
      }
    }
  }
  return out.toLowerCase();
}

/** drawText emits hex strings; convert a needle to its hex form for matching. */
function hexNeedle(text: string): string {
  return Array.from(text)
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
}

function countDistinctXObjectRefs(doc: PDFDocument): number {
  const refs = new Set<string>();
  for (const page of doc.getPages()) {
    const resources = page.node.Resources();
    const xObjects = resources?.lookup(PDFName.of("XObject"));
    if (!(xObjects instanceof PDFDict)) continue;
    for (const [, value] of xObjects.entries()) refs.add(String(value));
  }
  return refs.size;
}

/**
 * The pre-rewrite pipeline: reload + fill + flatten the template per week and
 * copy the pages over. Kept here so the resource-deduplication win of the
 * embed-once pipeline stays measured instead of assumed.
 */
async function legacyPlannerBuild(
  templateBytes: Uint8Array,
  weeks: number,
): Promise<Uint8Array> {
  const finalPdf = await PDFDocument.create();
  for (let weekIndex = 0; weekIndex < weeks; weekIndex++) {
    if (finalPdf.getPageCount() % 2 === 0) finalPdf.addPage([612, 792]);
    const weekDoc = await PDFDocument.load(templateBytes);
    const form = weekDoc.getForm();
    for (const name of ["xA", "xB", "xC", "xD", "xE"]) {
      form.getTextField(name).setText("01.09");
    }
    form.getTextField("WEEK_NUM").setText("KW 36");
    form.flatten();
    const pages = await finalPdf.copyPages(weekDoc, weekDoc.getPageIndices());
    for (const page of pages) finalPdf.addPage(page);
  }
  return finalPdf.save({ useObjectStreams: true, addDefaultPage: false });
}

describe("planner handler embed-once pipeline", () => {
  it("adds exactly the estimated pages and draws week texts", async () => {
    const templateBytes = await buildPlannerTemplate();
    const finalPdf = await PDFDocument.create();
    const context = makePlannerContext(finalPdf);

    const result = await plannerHandler.process(context, templateBytes);

    const estimated = estimatePlannerPageCount({
      periodStart: context.bookDetails.period.start,
      periodEnd: context.bookDetails.period.end,
      previewMode: false,
      currentPageCount: 0,
    });
    expect(result.pagesAdded).toBe(estimated);
    expect(finalPdf.getPageCount()).toBe(estimated);

    for (const page of finalPdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo(612, 4);
      expect(page.getHeight()).toBeCloseTo(792, 4);
    }

    const saved = await finalPdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });
    const reloaded = await PDFDocument.load(saved);
    const content = decodeContentStreams(reloaded);

    // Monday of the second processed week (period start itself).
    expect(content).toContain(hexNeedle("07.09"));
    // Custom date lands on Wednesday 2026-09-09.
    expect(content).toContain(hexNeedle("Projekttag"));
    expect(content).toContain(hexNeedle("KW "));
    expect(content).toContain(hexNeedle("September"));

    // Both template pages are stored once and referenced by every week page.
    expect(countDistinctXObjectRefs(reloaded)).toBe(2);
  });

  it("stores heavy template artwork once instead of once per week", async () => {
    const templateBytes = await buildPlannerTemplate({ artRects: 2000 });
    // 12 weeks: start-7d .. end spans 77 days => ceil(77/7)+1 = 12.
    const period = {
      start: new Date("2026-09-07T00:00:00.000Z"),
      end: new Date("2026-11-16T00:00:00.000Z"),
    };

    const legacyBytes = await legacyPlannerBuild(templateBytes, 12);

    const finalPdf = await PDFDocument.create();
    const context = makePlannerContext(finalPdf);
    context.bookDetails.period = period;
    const result = await plannerHandler.process(context, templateBytes);
    expect(result.pagesAdded).toBe(25); // 1 alignment + 12 weeks * 2 pages

    const newBytes = await finalPdf.save({
      useObjectStreams: true,
      addDefaultPage: false,
    });

    // The legacy pipeline re-embedded the artwork every week; embed-once must
    // beat it by a wide margin, not by rounding error.
    expect(newBytes.byteLength).toBeLessThan(legacyBytes.byteLength * 0.35);
  });

  it("caps preview mode at four weeks including server-side grayscale", async () => {
    const templateBytes = await buildPlannerTemplate();
    const finalPdf = await PDFDocument.create();
    const context = makePlannerContext(finalPdf, {
      previewMode: true,
      isGrayscale: true, // server-side preview grayscale is a passthrough
    });

    const result = await plannerHandler.process(context, templateBytes);

    expect(result.pagesAdded).toBe(9); // 1 alignment + 4 weeks * 2 pages
  });

  it("keeps blank template pages blank instead of failing to embed them", async () => {
    // A template whose pages carry only form fields but no drawn content.
    const doc = await PDFDocument.create();
    const pageA = doc.addPage([612, 792]);
    doc.addPage([612, 792]);
    const form = doc.getForm();
    const day = form.createTextField("xA");
    day.addToPage(pageA, {
      x: 30,
      y: 700,
      width: 90,
      height: 16,
      borderWidth: 0,
    });
    day.setFontSize(9);
    const templateBytes = await doc.save({ useObjectStreams: false });

    const finalPdf = await PDFDocument.create();
    const context = makePlannerContext(finalPdf);

    const result = await plannerHandler.process(context, templateBytes);

    expect(result.pagesAdded).toBe(29);
    const reloaded = await PDFDocument.load(
      await finalPdf.save({ useObjectStreams: true, addDefaultPage: false }),
    );
    // Dates still get drawn even though no artwork could be embedded.
    expect(decodeContentStreams(reloaded)).toContain(hexNeedle("07.09"));
  });

  it("uses a stored grayscale variant instead of the conversion API", async () => {
    const templateBytes = await buildPlannerTemplate();

    // Distinct 2-page variant delivered via data URL: no network, and if the
    // handler ignored it, the server-side API path would throw for the
    // missing GHOST_GRAYSCALE_API_KEY.
    const variantDoc = await PDFDocument.create();
    for (let i = 0; i < 2; i++) {
      const page = variantDoc.addPage([612, 792]);
      page.drawRectangle({
        x: 10,
        y: 10,
        width: 100,
        height: 100,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
    const variantBytes = await variantDoc.save();
    const variantUrl = `data:application/pdf;base64,${Buffer.from(variantBytes).toString("base64")}`;

    const finalPdf = await PDFDocument.create();
    const context = makePlannerContext(finalPdf, { isGrayscale: true });
    context.moduleItem = { ...context.moduleItem, grayscalePdfUrl: variantUrl };

    const result = await plannerHandler.process(context, templateBytes);

    expect(result.pagesAdded).toBe(29);
  });

  it("rejects templates that do not have exactly two pages", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const templateBytes = await doc.save();

    const finalPdf = await PDFDocument.create();
    const context = makePlannerContext(finalPdf);

    expect(plannerHandler.process(context, templateBytes)).rejects.toThrow(
      "exactly 2 pages",
    );
  });
});
