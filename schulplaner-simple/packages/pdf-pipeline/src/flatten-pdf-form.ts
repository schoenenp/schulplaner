import { PDFName, type PDFDocument } from "pdf-lib";

export function flattenPdfForm(document: PDFDocument): void {
  document.getForm().flatten();
  // pdf-lib can leave references to removed widgets, which become invalid
  // when copying pages. Keep live annotations such as links.
  for (const page of document.getPages()) {
    const annotations = page.node.Annots();
    if (!annotations) continue;
    for (let i = annotations.size() - 1; i >= 0; i--) {
      if (!document.context.lookup(annotations.get(i))) annotations.remove(i);
    }
    if (annotations.size() === 0) page.node.delete(PDFName.of("Annots"));
  }
}
