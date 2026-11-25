import { PDFDocument, PDFName, PDFTextField } from "pdf-lib";

/** Keep template geometry, but never bake sample text into grayscale artwork. */
export async function clearUploadTextFields(bytes: Uint8Array): Promise<Uint8Array> {
  const document = await PDFDocument.load(bytes);
  const fields = document.getForm().getFields().filter(
    (field): field is PDFTextField => field instanceof PDFTextField,
  );
  if (!fields.length) return bytes;

  for (const field of fields) {
    field.setText("");
    // Defaults and rich-text values must not restore the uploaded sample text.
    field.acroField.dict.delete(PDFName.of("DV"));
    field.acroField.dict.delete(PDFName.of("RV"));
  }
  // Saving regenerates dirty widget appearances, clearing the visible sample
  // text as well as /V. The fields stay editable for tag detection/generation.
  return document.save();
}
