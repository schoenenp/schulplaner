import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";

const run = promisify(execFile);
export const PREVIEW_MAX_EDGE = 1000;

/** Watermark before rasterization: the returned PDF contains only reduced-resolution images. */
export async function renderWatermarkedModulePreview(
  source: Uint8Array,
): Promise<Uint8Array> {
  if (source.byteLength > 25 * 1024 * 1024)
    throw new Error("PDF exceeds preview size limit");
  const document = await PDFDocument.load(source);
  const count = document.getPageCount();
  if (!count || count > 100) throw new Error("PDF exceeds preview page limit");
  document.getForm().flatten();
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  for (const page of document.getPages()) {
    const { x, y, width, height } = page.getCropBox();
    const size = Math.min(width, height) * 0.13;
    for (const position of [0.14, 0.41, 0.68]) {
      page.drawText("VORSCHAU", {
        x: x + width * 0.12,
        y: y + height * position,
        size,
        font,
        color: rgb(0.35, 0.35, 0.35),
        opacity: 0.32,
        rotate: degrees(30),
      });
    }
    page.drawText("VORSCHAU - NICHT ZUM DRUCKEN", {
      x: x + width * 0.05,
      y: y + height * 0.025,
      size: Math.min(width / 40, 11),
      font,
      color: rgb(0.25, 0.25, 0.25),
    });
  }
  const directory = await mkdtemp(join(tmpdir(), "books-module-preview-"));
  try {
    const input = join(directory, "watermarked.pdf");
    await writeFile(input, await document.save());
    // All parameters are fixed; no shell or user-controlled command arguments.
    await run(
      "pdftoppm",
      [
        "-scale-to",
        String(PREVIEW_MAX_EDGE),
        "-jpeg",
        "-jpegopt",
        "quality=55",
        input,
        join(directory, "page"),
      ],
      { timeout: 60_000, maxBuffer: 1024 * 1024 },
    );
    const result = await PDFDocument.create();
    for (let index = 0; index < count; index++) {
      const digits = String(count).length;
      const bytes = await readFile(
        join(directory, `page-${String(index + 1).padStart(digits, "0")}.jpg`),
      );
      const image = await result.embedJpg(bytes);
      const originalPage = document.getPage(index);
      const crop = originalPage.getCropBox();
      const rotated = Math.abs(originalPage.getRotation().angle % 180) === 90;
      const width = rotated ? crop.height : crop.width;
      const height = rotated ? crop.width : crop.height;
      const page = result.addPage([width, height]);
      page.drawImage(image, { x: 0, y: 0, width, height });
    }
    result.setTitle("Modulvorschau");
    result.setSubject("Reduzierte Auflösung mit Wasserzeichen");
    return await result.save();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
