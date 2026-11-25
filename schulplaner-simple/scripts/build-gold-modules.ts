import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PDFDocument, PDFName, StandardFonts, TextAlignment, cmyk, rgb, type PDFPage, type PDFFont } from "pdf-lib";

const root = resolve(import.meta.dir, "../modules/gold");
const MM = 72 / 25.4;

function field(doc: PDFDocument, page: PDFPage, font: PDFFont, name: string, x: number, top: number, width: number, height: number, size = 0, center = false) {
  const f = doc.getForm().createTextField(name);
  f.addToPage(page, { x, y: page.getHeight() - top - height, width, height, borderWidth: 0 });
  for (const widget of f.acroField.getWidgets()) {
    const appearance = widget.getAppearanceCharacteristics();
    appearance?.dict.delete(PDFName.of("BC"));
    appearance?.dict.delete(PDFName.of("BG"));
  }
  if (size) f.setFontSize(size);
  if (center) f.setAlignment(TextAlignment.Center);
  f.updateAppearances(font);
}

const weekly = await PDFDocument.load(await readFile(resolve(root, "wochenplan-artwork.pdf")));
const font = await weekly.embedFont(StandardFonts.Helvetica);
field(weekly, weekly.getPage(0), font, "WEEK_FROMTO", 26.7, 48, 294, 15, 9);
field(weekly, weekly.getPage(0), font, "WEEK_NUM", 328, 48, 70, 15, 9);
// Day dates use the free area beside "Fach". Events occupy the last ruled
// writing line; the multilingual weekday captions remain original artwork.
const rows = [{ page: 0, top: 73.5 }, { page: 0, top: 253.94 }, { page: 0, top: 434.38 }, { page: 1, top: 26.44 }, { page: 1, top: 206.88 }];
rows.forEach((row, i) => {
  const page = weekly.getPage(row.page);
  const name = `x${String.fromCharCode(65 + i)}`;
  field(weekly, page, font, name, 57, row.top, 47, 14, 8);
  field(weekly, page, font, `${name}_Date`, 83, row.top + 135.4, 282, 12);
});
// Weekend holidays have no day row in a Monday–Friday planner; keep them
// visible in the existing "Wichtige Mitteilungen" area of the same week.
field(weekly, weekly.getPage(1), font, "WEEKEND_DATES", 26.7, 542, 250, 34, 7);
weekly.getForm().getTextField("WEEKEND_DATES").enableMultiline();
weekly.setTitle("Wochenplan 2 · Beige/Gold · dynamische Wochenvorlage");
if (!process.argv.includes("--cover-only")) {
  await writeFile(resolve(root, "wochenplan.pdf"), await weekly.save());
}

const cover = await PDFDocument.create();
const coverFont = await cover.embedFont(StandardFonts.Helvetica);
const beige = rgb(0.976, 0.949, 0.882);
// Existing warm yellow converted to CMYK; magenta +5 percentage points.
const gold = cmyk(0, 1 - 0.65 / 0.69 + 0.05, 1 - 0.46 / 0.69, 1 - 0.69);
const foldLayers = [
  {
    start: [-0.02, 0.89],
    curves: [[0.20, 0.963, 0.356, 0.724, 0.536, 0.694], [0.724, 0.667, 0.884, 0.760, 1.02, 0.469]],
    color: cmyk(0, 0.084, 0.244, 0.212),
  },
  {
    start: [0.28, 1.03],
    curves: [[0.455, 0.946, 0.582, 0.898, 0.746, 0.876], [0.875, 0.86, 0.961, 0.702, 1.02, 0.635]],
    color: cmyk(0, 0.10, 0.295, 0.273),
  },
] as const;

for (let i = 0; i < 4; i++) {
  const page = cover.addPage([154 * MM, 216 * MM]);
  const { width, height } = page.getSize();
  const outer = i === 0 || i === 3;
  page.drawRectangle({ x: 0, y: 0, width, height, color: outer ? gold : beige });
  if (outer) {
    const point = (x: number, y: number) => `${(i === 3 ? 1 - x : x) * width} ${y * height}`;
    for (const { start, curves, color } of foldLayers) {
      const contour = `M ${point(...start)} ${curves.map(([x1, y1, x2, y2, x, y]) =>
        `C ${point(x1, y1)} ${point(x2, y2)} ${point(x, y)}`,
      ).join(" ")}`;
      page.drawSvgPath(`${contour} L ${point(1.02, 1.04)} L ${point(start[0], 1.04)} Z`, {
        x: 0, y: height, color,
      });
      page.drawSvgPath(contour, {
        x: 0, y: height, borderColor: cmyk(0, 0.041, 0.134, 0.048), borderWidth: 0.43, borderOpacity: 0.5,
      });
    }
  }
  page.setTrimBox(3 * MM, 3 * MM, 148 * MM, 210 * MM);
  page.setBleedBox(0, 0, 154 * MM, 216 * MM);
  if (i === 0) {
    const w = width * 410 / 612.283, h = height * 189 / 858.898, r = 2;
    const x = (width - w) / 2, top = height * 154 / 858.898;
    const panel = `M ${r} 0 H ${w-r} Q ${w} 0 ${w} ${r} V ${h-r} Q ${w} ${h} ${w-r} ${h} H ${r} Q 0 ${h} 0 ${h-r} V ${r} Q 0 0 ${r} 0 Z`;
    page.drawSvgPath(panel, { x, y: height - top, color: beige });
    page.drawRectangle({ x: x + 5, y: height - top - h + 5, width: w - 10, height: h - 10, borderColor: rgb(0.60, 0.46, 0.19), borderWidth: 0.55, borderOpacity: 0.45 });
    const textInset = 18;
    // Offset the fields slightly to center the visible Helvetica glyphs.
    const textMidpoint = top + h / 2 + 2.3;
    field(cover, page, coverFont, "BOOK_TITLE", x + textInset, textMidpoint - 38, w - 2 * textInset, 36, 24, true);
    field(cover, page, coverFont, "FROM_TO", x + textInset, textMidpoint + 4, w - 2 * textInset, 28, 17, true);
  }
}
cover.setTitle("Standardumschlag Beige/Gold · Papierfalte");
await writeFile(resolve(root, "umschlag.pdf"), await cover.save());
console.log("Beige/gold four-page cover built.");
