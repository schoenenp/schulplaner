import { PDFDocument, rgb } from "pdf-lib";
import { flattenPdfForm } from "pdf-pipeline";

/** Normalize a school cover to four immutable PDF pages. Images fit without cropping. */
export async function buildCustomCover(bytes: Uint8Array, kind: string, width: number, height: number) {
  if (kind === "application/pdf") {
    const source = await PDFDocument.load(bytes);
    if (source.getPageCount() !== 4) throw new Error("Dein PDF braucht genau 4 Seiten: U1, U2, U3, U4.");
    for (const page of source.getPages()) {
      const size = page.getSize();
      if (Math.abs(size.width - width) > 3 || Math.abs(size.height - height) > 3)
        throw new Error(`Die PDF-Seiten müssen ${(width * 25.4 / 72).toFixed(0)} × ${(height * 25.4 / 72).toFixed(0)} mm groß sein (wie der Standardumschlag).`);
    }
    // Copy only page content into a new document; discard document actions and attachments.
    const result = await PDFDocument.create();
    flattenPdfForm(source);
    for (const page of await result.copyPages(source, [0, 1, 2, 3])) result.addPage(page);
    return result.save();
  }
  if (kind !== "image/png" && kind !== "image/jpeg") throw new Error("Bitte ein JPG, PNG oder ein vierseitiges PDF auswählen.");
  const result = await PDFDocument.create();
  const image = kind === "image/png" ? await result.embedPng(bytes) : await result.embedJpg(bytes);
  const scale = Math.min(width / image.width, height / image.height);
  const front = result.addPage([width, height]);
  front.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
  front.drawImage(image, { x: (width-image.width*scale)/2, y:(height-image.height*scale)/2, width:image.width*scale, height:image.height*scale });
  for(let i=0;i<3;i++) result.addPage([width,height]);
  return result.save();
}
