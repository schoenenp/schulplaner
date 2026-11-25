import { expect, it } from "bun:test";
import { PDFDocument, PDFName, PDFString, PDFRawStream, decodePDFRawStream, StandardFonts } from "pdf-lib";
import { clearUploadTextFields } from "./clear-upload-text-fields";

it("clears sample values, defaults, and appearances while preserving usable fields", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage();
  page.drawText("Permanent artwork");
  const field = source.getForm().createTextField("xA");
  field.addToPage(page, { x: 50, y: 100, width: 120, height: 24 });
  field.setText("01.01.");
  field.acroField.dict.set(PDFName.of("DV"), PDFString.of("01.01."));
  field.acroField.dict.set(PDFName.of("RV"), PDFString.of("sample"));
  const font = await source.embedFont(StandardFonts.Helvetica);
  source.getForm().updateFieldAppearances(font);
  const rectangle = field.acroField.getWidgets()[0]!.getRectangle();
  const cleaned = await PDFDocument.load(await clearUploadTextFields(await source.save()));
  const result = cleaned.getForm().getTextField("xA");
  expect(result.getText() ?? "").toBe("");
  expect(result.acroField.dict.has(PDFName.of("DV"))).toBe(false);
  expect(result.acroField.dict.has(PDFName.of("RV"))).toBe(false);
  expect(result.acroField.getWidgets()[0]!.getRectangle()).toEqual(rectangle);

  // Clearing /V alone leaves the old appearance available to Ghostscript.
  const appearance = cleaned.context.lookup(
    result.acroField.getWidgets()[0]!.getNormalAppearance(),
  );
  if (!(appearance instanceof PDFRawStream)) throw new Error("Missing field appearance");
  const content = new TextDecoder().decode(decodePDFRawStream(appearance).decode());
  expect(content).not.toContain("30312E30312E");
  expect(content).not.toContain("01.01.");
  result.setText("12.10");
  cleaned.getForm().updateFieldAppearances(await cleaned.embedFont(StandardFonts.Helvetica));
  expect(result.getText()).toBe("12.10");

});

it("leaves PDFs without text fields byte-for-byte unchanged", async () => {
  const source = await PDFDocument.create();
  source.addPage().drawText("Static content");
  const bytes = await source.save();
  expect(await clearUploadTextFields(bytes)).toBe(bytes);
});
