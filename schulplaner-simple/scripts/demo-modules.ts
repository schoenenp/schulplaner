/**
 * Writes demo module PDFs (A5 with 3 mm bleed) that use the same form-field
 * placeholders as the real templates, for trying the shop and the panel
 * without production artwork:
 *
 *   bun scripts/demo-modules.ts [output-dir]   (default: demo-modules/)
 *
 * Upload them under Panel → Module & Umschläge.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PDFDocument, PDFName, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";

const MM = 72 / 25.4;
const WIDTH = 154 * MM;
const HEIGHT = 216 * MM;
const outDir = resolve(process.argv[2] ?? "demo-modules");

type Ctx = { doc: PDFDocument; font: PDFFont; bold: PDFFont };

async function create(): Promise<Ctx> {
  const doc = await PDFDocument.create();
  return {
    doc,
    font: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
}

function addPage(ctx: Ctx, background = rgb(1, 1, 1)) {
  const page = ctx.doc.addPage([WIDTH, HEIGHT]);
  page.drawRectangle({ x: 0, y: 0, width: WIDTH, height: HEIGHT, color: background });
  // Trim box marks the finished A5 size inside the bleed.
  page.setTrimBox(3 * MM, 3 * MM, 148 * MM, 210 * MM);
  return page;
}

function textField(
  ctx: Ctx,
  page: PDFPage,
  name: string,
  box: { x: number; y: number; width: number; height: number },
  fontSize = 0,
  center = false,
) {
  const field = ctx.doc.getForm().createTextField(name);
  field.addToPage(page, { ...box, borderWidth: 0 });
  // pdf-lib defaults to a black hairline border and white fill; real
  // templates have neither, so drop both and redraw the appearance.
  for (const widget of field.acroField.getWidgets()) {
    const characteristics = widget.getAppearanceCharacteristics();
    characteristics?.dict.delete(PDFName.of("BC"));
    characteristics?.dict.delete(PDFName.of("BG"));
  }
  if (fontSize) field.setFontSize(fontSize);
  if (center) field.setAlignment(1);
  field.defaultUpdateAppearances(ctx.font);
}

async function cover(fileName: string, color: RGB, accent: RGB, label: string) {
  const ctx = await create();
  const front = addPage(ctx, color);
  front.drawCircle({ x: WIDTH * 0.8, y: HEIGHT * 0.82, size: 70, color: accent, opacity: 0.6 });
  front.drawCircle({ x: WIDTH * 0.15, y: HEIGHT * 0.12, size: 110, color: accent, opacity: 0.35 });
  textField(ctx, front, "BOOK_TITLE", { x: 20 * MM, y: 120 * MM, width: 114 * MM, height: 22 * MM }, 30, true);
  textField(ctx, front, "BOOK_SUBTITLE", { x: 20 * MM, y: 105 * MM, width: 114 * MM, height: 12 * MM }, 16, true);
  textField(ctx, front, "FROM_TO", { x: 47 * MM, y: 30 * MM, width: 60 * MM, height: 14 * MM }, 22, true);
  front.drawText(label, { x: 20 * MM, y: 12 * MM, size: 8, font: ctx.font, color: rgb(1, 1, 1) });

  const inner = addPage(ctx);
  inner.drawText("Dieser Planer gehört:", { x: 20 * MM, y: 180 * MM, size: 14, font: ctx.bold });
  for (let line = 0; line < 4; line++) {
    inner.drawLine({ start: { x: 20 * MM, y: (165 - line * 14) * MM }, end: { x: 134 * MM, y: (165 - line * 14) * MM }, thickness: 0.5 });
  }
  const innerBack = addPage(ctx);
  innerBack.drawText("Notizen", { x: 20 * MM, y: 190 * MM, size: 14, font: ctx.bold });
  const back = addPage(ctx, color);
  back.drawText("Demo-Umschlag · Rückseite", { x: 20 * MM, y: 20 * MM, size: 10, font: ctx.font, color: rgb(1, 1, 1) });
  await writeFile(join(outDir, fileName), await ctx.doc.save());
}

async function weekSpread() {
  const ctx = await create();
  const days = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag"];
  const letters = ["xA", "xB", "xC", "xD", "xE"];
  const left = addPage(ctx);
  const right = addPage(ctx);
  textField(ctx, left, "WEEK_FROMTO", { x: 12 * MM, y: 196 * MM, width: 100 * MM, height: 8 * MM }, 10);
  textField(ctx, right, "WEEK_NUM", { x: 112 * MM, y: 196 * MM, width: 30 * MM, height: 8 * MM }, 10, true);
  // Mon–Wed on the left page, Thu–Fri plus notes on the right page.
  const rowHeight = 60 * MM;
  days.forEach((day, index) => {
    const page = index < 3 ? left : right;
    const row = index < 3 ? index : index - 3;
    const top = 192 * MM - row * rowHeight;
    page.drawRectangle({ x: 12 * MM, y: top - rowHeight + 2 * MM, width: 130 * MM, height: rowHeight - 4 * MM, borderColor: rgb(0.75, 0.8, 0.85), borderWidth: 0.6 });
    page.drawRectangle({ x: 12 * MM, y: top - 10 * MM, width: 130 * MM, height: 8 * MM, color: rgb(0.91, 0.95, 0.97) });
    page.drawText(day, { x: 15 * MM, y: top - 7.5 * MM, size: 10, font: ctx.bold, color: rgb(0.12, 0.37, 0.55) });
    textField(ctx, page, letters[index]!, { x: 45 * MM, y: top - 9.5 * MM, width: 18 * MM, height: 7 * MM }, 9);
    textField(ctx, page, `${letters[index]}_Date`, { x: 66 * MM, y: top - 9.5 * MM, width: 74 * MM, height: 7 * MM }, 8);
  });
  right.drawText("Notizen der Woche", { x: 15 * MM, y: 192 * MM - 2 * rowHeight - 7.5 * MM, size: 10, font: ctx.bold, color: rgb(0.12, 0.37, 0.55) });
  await writeFile(join(outDir, "wochen-doppelseite.pdf"), await ctx.doc.save());
}

async function contentPages(fileName: string, titles: string[]) {
  const ctx = await create();
  for (const title of titles) {
    const page = addPage(ctx);
    page.drawText(title, { x: 15 * MM, y: 192 * MM, size: 18, font: ctx.bold, color: rgb(0.12, 0.37, 0.55) });
    for (let line = 0; line < 18; line++) {
      const y = (178 - line * 9) * MM;
      page.drawLine({ start: { x: 15 * MM, y }, end: { x: 139 * MM, y }, thickness: 0.4, color: rgb(0.75, 0.8, 0.85) });
    }
  }
  await writeFile(join(outDir, fileName), await ctx.doc.save());
}

await mkdir(outDir, { recursive: true });
await cover("umschlag-standard.pdf", rgb(0.12, 0.37, 0.55), rgb(0.95, 0.65, 0.25), "Standardumschlag");
await cover("umschlag-gruen.pdf", rgb(0.2, 0.5, 0.35), rgb(0.85, 0.9, 0.3), "Umschlag Grün");
await cover("umschlag-beere.pdf", rgb(0.55, 0.15, 0.35), rgb(0.95, 0.75, 0.8), "Umschlag Beere");
await contentPages("vorspann.pdf", ["Meine Daten", "Stundenplan 1. Halbjahr", "Stundenplan 2. Halbjahr", "Schulregeln"]);
await weekSpread();
await contentPages("notizen.pdf", ["Notizen", "Notizen"]);
console.log(`Demo modules written to ${outDir}`);
