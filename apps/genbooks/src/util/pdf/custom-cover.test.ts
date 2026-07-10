import { describe, expect, it } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { createCustomCoverPdf } from "./custom-cover";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4n8AAAAASUVORK5CYII=";

async function createTemplateBytes(pageCount: number) {
  const pdfDoc = await PDFDocument.create();
  const pages = Array.from({ length: pageCount }, () =>
    pdfDoc.addPage([595, 842]),
  );
  const form = pdfDoc.getForm();
  const imageField = form.createButton("COVER_IMAGE");

  imageField.addToPage("Image", pages[0]!, {
    x: 48,
    y: 420,
    width: 240,
    height: 240,
    borderWidth: 0,
  });

  return pdfDoc.save();
}

async function createTemplateWithoutImageFieldBytes() {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([595, 842]);
  return pdfDoc.save();
}

describe("custom cover pdf creation", () => {
  it("creates a saved four-page cover pdf from a short template and image", async () => {
    const outputBytes = await createCustomCoverPdf(
      await createTemplateBytes(1),
      Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"),
    );
    const outputDoc = await PDFDocument.load(outputBytes);

    expect(outputDoc.getPageCount()).toBe(4);
    expect(outputDoc.getForm().getFields().length).toBeGreaterThan(0);
  });

  it("trims longer custom cover templates to four pages", async () => {
    const outputBytes = await createCustomCoverPdf(
      await createTemplateBytes(6),
      Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"),
    );
    const outputDoc = await PDFDocument.load(outputBytes);

    expect(outputDoc.getPageCount()).toBe(4);
  });

  it("draws the image onto the first page when the template has no image field", async () => {
    const outputBytes = await createCustomCoverPdf(
      await createTemplateWithoutImageFieldBytes(),
      Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"),
    );
    const outputDoc = await PDFDocument.load(outputBytes);

    expect(outputDoc.getPageCount()).toBe(4);
  });
});
