import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { addWatermark } from "./watermark";

const originalFetch = globalThis.fetch;
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4n8AAAAASUVORK5CYII=",
  "base64",
);
let errorLog: ReturnType<typeof spyOn> | undefined;

afterEach(() => {
  globalThis.fetch = originalFetch;
  errorLog?.mockRestore();
  errorLog = undefined;
});

for (const app of ["genbooks", "panel_books"]) {
  // Generated deployment branches contain only their own app.
  if (
    await Bun.file(
      new URL(`../../../apps/${app}/package.json`, import.meta.url),
    ).exists()
  ) {
    it(`${app} ships a valid watermark PNG at the requested public path`, async () => {
      const bytes = await Bun.file(
        new URL(
          `../../../apps/${app}/public/assets/watermark.png`,
          import.meta.url,
        ),
      ).arrayBuffer();
      const pdf = await PDFDocument.create();
      const image = await pdf.embedPng(bytes);
      expect(image.width).toBeGreaterThan(0);
      expect(image.height).toBeGreaterThan(0);
    });
  }
}

function responseWith(response: Response) {
  globalThis.fetch = Object.assign(async () => response, {
    preconnect: originalFetch.preconnect,
  });
}

describe("required preview watermark", () => {
  it("embeds the image on every page", async () => {
    responseWith(
      new Response(onePixelPng, { headers: { "content-type": "image/png" } }),
    );
    const pdf = await PDFDocument.create();
    pdf.addPage();
    pdf.addPage();
    await addWatermark(pdf);
    for (const page of pdf.getPages())
      expect(page.node.Resources()?.toString()).toContain("/Image-");
    expect((await PDFDocument.load(await pdf.save())).getPageCount()).toBe(2);
  });

  for (const status of [404, 200]) {
    it(`rejects an HTML response with HTTP ${status} instead of returning an unwatermarked PDF`, async () => {
      errorLog = spyOn(console, "error").mockImplementation(() => {});
      responseWith(
        new Response("<!doctype html><h1>Not found</h1>", {
          status,
          headers: { "content-type": "text/html" },
        }),
      );
      const pdf = await PDFDocument.create();
      pdf.addPage();
      await expect(addWatermark(pdf)).rejects.toThrow(
        "Das Wasserzeichen konnte nicht hinzugefügt werden",
      );
      expect(errorLog).toHaveBeenCalled();
    });
  }
});
