import { describe, expect, it } from "bun:test";
import {
  PDFDocument,
  StandardFonts,
  TextAlignment,
  type PDFFont,
} from "pdf-lib";
import {
  computeOverlayLayout,
  readTemplateFieldSpecs,
} from "./template-overlay";

// pdf-lib's internal single-line layout, deep-imported so the overlay math can
// be asserted equal to what fill-and-flatten would have produced.
const { layoutSinglelineText } = await import(
  "pdf-lib/cjs/api/text/layout.js"
);

async function makeFont(): Promise<PDFFont> {
  const doc = await PDFDocument.create();
  return doc.embedFont(StandardFonts.Helvetica);
}

describe("computeOverlayLayout", () => {
  it("matches pdf-lib's flatten layout for every alignment and explicit sizes", async () => {
    const font = await makeFont();
    const bounds = { x: 41, y: 701, width: 120, height: 18 };
    const text = "07.09. bis 11.09.2026";

    for (const alignment of [
      TextAlignment.Left,
      TextAlignment.Center,
      TextAlignment.Right,
    ]) {
      for (const fontSize of [9, 12.5]) {
        const expected = layoutSinglelineText(text, {
          alignment,
          fontSize,
          font,
          bounds,
        });
        const actual = computeOverlayLayout(
          text,
          { bounds, fontSize, alignment },
          font,
        );
        expect(actual.fontSize).toBe(expected.fontSize);
        expect(actual.x).toBeCloseTo(expected.line.x, 6);
        expect(actual.y).toBeCloseTo(expected.line.y, 6);
      }
    }
  });

  it("matches pdf-lib's auto font-size search when the DA size is 0", async () => {
    const font = await makeFont();
    const bounds = { x: 10, y: 10, width: 64, height: 14 };
    const text = "KW 36";

    const expected = layoutSinglelineText(text, {
      alignment: TextAlignment.Center,
      fontSize: undefined,
      font,
      bounds,
    });
    const actual = computeOverlayLayout(
      text,
      { bounds, fontSize: 0, alignment: TextAlignment.Center },
      font,
    );

    expect(actual.fontSize).toBe(expected.fontSize);
    expect(actual.x).toBeCloseTo(expected.line.x, 6);
    expect(actual.y).toBeCloseTo(expected.line.y, 6);
  });
});

describe("readTemplateFieldSpecs", () => {
  it("reads rect, page index, size, and alignment from a loaded template", async () => {
    const doc = await PDFDocument.create();
    const pageA = doc.addPage([612, 792]);
    const pageB = doc.addPage([612, 792]);
    const form = doc.getForm();

    // borderWidth 0: pdf-lib otherwise defaults to 1 and grows the rect by it.
    const xA = form.createTextField("xA");
    xA.addToPage(pageA, {
      x: 50,
      y: 100,
      width: 80,
      height: 20,
      borderWidth: 0,
    });
    xA.setFontSize(9);
    xA.setAlignment(TextAlignment.Center);

    const weekNum = form.createTextField("WEEK_NUM");
    weekNum.addToPage(pageB, {
      x: 500,
      y: 750,
      width: 60,
      height: 16,
      borderWidth: 0,
    });
    weekNum.setAlignment(TextAlignment.Right);

    // Round-trip through bytes: production reads templates loaded from a URL.
    const loaded = await PDFDocument.load(await doc.save());
    const specs = readTemplateFieldSpecs(loaded, [
      "xA",
      "WEEK_NUM",
      "DOES_NOT_EXIST",
    ]);

    expect(specs.has("DOES_NOT_EXIST")).toBe(false);

    const [xASpec] = specs.get("xA")!;
    expect(xASpec!.pageIndex).toBe(0);
    // Widget rect inset by borderWidth (0 here) + 1pt padding, like pdf-lib.
    expect(xASpec!.bounds.x).toBeCloseTo(51, 4);
    expect(xASpec!.bounds.y).toBeCloseTo(101, 4);
    expect(xASpec!.bounds.width).toBeCloseTo(78, 4);
    expect(xASpec!.bounds.height).toBeCloseTo(18, 4);
    expect(xASpec!.fontSize).toBe(9);
    expect(xASpec!.alignment).toBe(TextAlignment.Center);

    const [weekSpec] = specs.get("WEEK_NUM")!;
    expect(weekSpec!.pageIndex).toBe(1);
    expect(weekSpec!.alignment).toBe(TextAlignment.Right);
    // pdf-lib writes the auto-computed size back into the DA on creation, so
    // an explicit positive size must come out of parsing.
    expect(weekSpec!.fontSize).toBeGreaterThan(0);
  });
});
