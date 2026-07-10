import { afterEach, describe, expect, it } from "bun:test";
import { PDFDocument } from "pdf-lib";
import coverHandler from "./cover.handler";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4n8AAAAASUVORK5CYII=";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function createCoverTemplateBytes(withImageField = true) {
  const pdfDoc = await PDFDocument.create();
  const pages = Array.from({ length: 4 }, () => pdfDoc.addPage([595, 842]));
  const form = pdfDoc.getForm();

  const titleField = form.createTextField("BOOK_TITLE");
  titleField.addToPage(pages[0]!, {
    x: 48,
    y: 760,
    width: 220,
    height: 24,
  });

  const yearField = form.createTextField("FROM_TO");
  yearField.addToPage(pages[0]!, {
    x: 48,
    y: 720,
    width: 140,
    height: 24,
  });

  if (withImageField) {
    const imageField = form.createButton("COVER_IMAGE");
    imageField.addToPage("Image", pages[0]!, {
      x: 48,
      y: 420,
      width: 240,
      height: 240,
      borderWidth: 0,
    });
  }

  return pdfDoc.save();
}

describe("cover handler", () => {
  it("injects a custom cover image into the configured placeholder", async () => {
    globalThis.fetch = ((async () =>
      new Response(Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"), {
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      })) as unknown as typeof fetch);

    const finalPdf = await PDFDocument.create();
    const templateBytes = await createCoverTemplateBytes(true);

    const result = await coverHandler.process(
      {
        bookDetails: {
          title: "Custom Cover Test",
          addHolidays: true,
          period: {
            start: new Date("2026-01-01T00:00:00.000Z"),
            end: new Date("2026-12-31T00:00:00.000Z"),
          },
        },
        moduleItem: {
          id: "cover-1",
          idx: 0,
          type: "umschlag",
          pdfUrl: "https://example.com/template.pdf",
          coverImageUrl: "https://example.com/custom-cover.png",
        },
        finalPdf,
        format: "DIN A5",
        previewMode: false,
        isGrayscale: false,
      },
      templateBytes,
    );

    expect(result.pagesAdded).toBe(2);
    expect(finalPdf.getPageCount()).toBe(2);
    expect(result.backCoverDoc?.getPageCount()).toBe(2);
  });

  it("fails clearly when a custom cover image is provided but the template has no image placeholder", async () => {
    globalThis.fetch = ((async () =>
      new Response(Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"), {
        status: 200,
        headers: {
          "content-type": "image/png",
        },
      })) as unknown as typeof fetch);

    const finalPdf = await PDFDocument.create();
    const templateBytes = await createCoverTemplateBytes(false);

    await expect(
      coverHandler.process(
        {
          bookDetails: {
            title: "Missing Placeholder",
            addHolidays: true,
            period: {
              start: new Date("2026-01-01T00:00:00.000Z"),
              end: new Date("2026-12-31T00:00:00.000Z"),
            },
          },
          moduleItem: {
            id: "cover-2",
            idx: 0,
            type: "umschlag",
            pdfUrl: "https://example.com/template.pdf",
            coverImageUrl: "https://example.com/custom-cover.png",
          },
          finalPdf,
          format: "DIN A5",
          previewMode: false,
          isGrayscale: false,
        },
        templateBytes,
      ),
    ).rejects.toThrow("Custom cover image placeholder not found");
  });
});
