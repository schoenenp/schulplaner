import { describe, expect, it } from "bun:test";
import { calculatePdfPageCounts } from "./converter";
import { estimatePlannerPageCount } from "./handlers/planner-page-count";
import type { PDFModule } from "./types";

describe("calculatePdfPageCounts with stored page counts", () => {
  it("derives counts arithmetically without fetching module PDFs", async () => {
    const period = {
      start: new Date("2026-09-07T00:00:00.000Z"),
      end: new Date("2026-11-27T00:00:00.000Z"),
    };

    // Empty pdfUrl would fall back to a 1-page blank if anything tried to
    // fetch and parse it, so a wrong total exposes accidental downloads.
    const modules: PDFModule[] = [
      { id: "cover", type: "umschlag", idx: 0, pdfUrl: "", pageCount: 4 },
      { id: "notes", type: "notizen", idx: 1, pdfUrl: "", pageCount: 37 },
      { id: "planner", type: "wochenplaner", idx: 2, pdfUrl: "" },
    ];

    const plannerPages = estimatePlannerPageCount({
      periodStart: period.start,
      periodEnd: period.end,
      previewMode: false,
      currentPageCount: 4 + 37,
    });

    const counts = await calculatePdfPageCounts(
      {
        title: "Testplaner",
        addHolidays: false,
        period,
      },
      modules,
      { colorMap: new Map([["notes", 1]]) },
    );

    const beforeAlignment = 4 + 37 + plannerPages;
    const remainder = beforeAlignment % 4;
    const alignmentPages = remainder === 0 ? 0 : 4 - remainder;

    expect(counts.fullPageCount).toBe(beforeAlignment + alignmentPages);
    // Grayscale selection: the 37 stored pages plus blank alignment pages.
    expect(counts.bPages).toBe(37 + alignmentPages);
    expect(counts.cPages).toBe(4 + plannerPages);
  });
});
