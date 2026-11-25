import { describe, expect, it } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { checkPageFormat } from "./generation-checks";
import { getPageSizeWithBleed, PAGE_DIMENSIONS } from "./helpers";

describe("generated page format checks", () => {
  it("catches the A4 output in an A5 configuration, including a mixed-size inner page", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([PAGE_DIMENSIONS.A5_WIDTH, PAGE_DIMENSIONS.A5_HEIGHT]);
    doc.addPage([PAGE_DIMENSIONS.A4_WIDTH, PAGE_DIMENSIONS.A4_HEIGHT]);
    const check = checkPageFormat(doc, "DIN A5");
    expect(check.status).toBe("warning");
    expect(check.message).toContain("1 PDF-Seiten");
    expect(check.message).toContain("Seite 2");
  });

  it("accepts selected trim size and the pipeline's bleed size, with rounding tolerance", async () => {
    for (const format of ["DIN A4", "DIN A5"] as const) {
      const doc = await PDFDocument.create();
      const size = getPageSizeWithBleed(format);
      doc.addPage([size.width, size.height]);
      const trim = format === "DIN A4" ? [595, 842] : [420, 595];
      doc.addPage(trim as [number, number]);
      expect(checkPageFormat(doc, format).status).toBe("passed");
    }
  });

  it("uses explicit trim boxes on documents with a larger media box", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([500, 680]);
    page.setTrimBox(
      20,
      20,
      PAGE_DIMENSIONS.A5_WIDTH,
      PAGE_DIMENSIONS.A5_HEIGHT,
    );
    expect(checkPageFormat(doc, "DIN A5").status).toBe("passed");
  });
});
