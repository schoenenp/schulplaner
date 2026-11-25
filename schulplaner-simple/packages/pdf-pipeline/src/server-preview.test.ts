import { expect, test } from "bun:test";
import { degrees, PDFDocument, PDFDict, PDFName, PDFRawStream } from "pdf-lib";
import {
  PREVIEW_MAX_EDGE,
  renderWatermarkedModulePreview,
} from "./server-preview";

test.skipIf(!Bun.which("pdftoppm"))(
  "preview preserves pages while replacing source objects with bounded raster images",
  async () => {
    const original = await PDFDocument.create();
    original.addPage([595, 842]).drawText("Original confidential vector text");
    original.addPage([842, 595]).drawText("Second page");
    original.addPage([595, 842]).setRotation(degrees(90));
    const source = await original.save();
    const untouched = source.slice();
    const output = await renderWatermarkedModulePreview(source);
    expect(source).toEqual(untouched);
    const document = await PDFDocument.load(output);
    expect(document.getPageCount()).toBe(3);
    expect(document.getForm().getFields()).toHaveLength(0);
    for (const [index, page] of document.getPages().entries()) {
      expect(page.getSize()).toEqual(
        index === 2
          ? { width: 842, height: 595 }
          : original.getPage(index).getSize(),
      );
      const resources = page.node.Resources()!;
      expect(resources.lookup(PDFName.of("Font"), PDFDict).keys()).toHaveLength(
        0,
      );
      const images = resources.lookup(PDFName.of("XObject"), PDFDict);
      expect(images.keys()).toHaveLength(1);
      const image = images.lookup(images.keys()[0]!);
      if (!(image instanceof PDFRawStream))
        throw new Error("Expected raster image stream");
      const width = Number(image.dict.get(PDFName.of("Width"))!.toString());
      const height = Number(image.dict.get(PDFName.of("Height"))!.toString());
      expect(Math.max(width, height)).toBeLessThanOrEqual(PREVIEW_MAX_EDGE);
      expect(image.dict.get(PDFName.of("Filter"))!.toString()).toBe(
        "/DCTDecode",
      );
    }
  },
);
