import { expect, test } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { addPageNumbers } from "./pagination";

test("A5 footer stays below the gold table and inside the trim", async () => {
  const doc = await PDFDocument.create();
  const pages = Array.from({ length: 8 }, () => doc.addPage([436.535, 612.283]));
  for (const page of pages) page.setArtBox(8.5, 8.5, 419.535, 595.283);
  const drawn: Array<{ page: number; text: string; x: number; y: number; size: number }> = [];
  pages.forEach((page, index) => {
    page.drawText = (text, options) => { drawn.push({ page: index, text, x: options!.x!, y: options!.y!, size: options!.size! }); };
  });
  addPageNumbers(doc);
  expect(drawn).toHaveLength(4);
  for (const number of drawn) {
    expect(number.page).toBeGreaterThanOrEqual(2);
    expect(number.page).toBeLessThan(6);
    expect(number.y).toBeGreaterThan(8.5);
    expect(number.y + number.size).toBeLessThan(19); // bottom rule of the source artwork
    expect(number.x).toBeGreaterThan(8.5);
    expect(number.x).toBeLessThan(428);
  }
});
