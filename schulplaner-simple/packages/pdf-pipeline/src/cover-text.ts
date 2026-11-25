import { StandardFonts, type PDFDocument } from "pdf-lib";
import { readTemplateFieldSpecs } from "./template-overlay";
import type { BookDetails, GenerationCheck } from "./types";

/** Fit every cover label to its actual widget, including fixed-size templates. */
export async function fillCoverText(
  document: PDFDocument,
  details: Pick<BookDetails, "title" | "subtitle" | "period">,
): Promise<GenerationCheck[]> {
  const form = document.getForm();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const start = details.period.start?.getFullYear();
  const end = details.period.end?.getFullYear();
  const values = {
    BOOK_TITLE: details.title,
    BOOK_SUBTITLE: details.subtitle?.trim() ?? "",
    FROM_TO: start
      ? end && start !== end
        ? `${start}/${end}`
        : `${start}`
      : "",
  };
  const specs = readTemplateFieldSpecs(document, Object.keys(values));
  const sizes = new Map<string, number>();
  for (const [name, value] of Object.entries(values)) {
    const widgets = specs.get(name);
    if (!widgets?.length) continue;
    const text = value.replace(/[\r\n\t]+/g, " ");
    const width = font.widthOfTextAtSize(text, 1);
    const height = font.heightAtSize(1) * 1.2;
    const size = Math.min(
      ...widgets.map((widget) =>
        Math.min(
          widget.fontSize && widget.fontSize > 0 ? widget.fontSize : 48,
          width ? widget.bounds.width / width : 48,
          widget.bounds.height / height,
        ),
      ),
    );
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(
        `Umschlag: Das Textfeld ${name} hat keine nutzbare Fläche.`,
      );
    }
    const field = form.getTextField(name);
    field.setText(text);
    field.setFontSize(size);
    field.updateAppearances(font);
    sizes.set(name, size);
  }
  const titleSize = sizes.get("BOOK_TITLE");
  const checks: GenerationCheck[] = [
    {
      code: "cover-title",
      status: titleSize !== undefined && titleSize >= 10 ? "passed" : "warning",
      message:
        titleSize === undefined
          ? "Diese Umschlagvorlage hat kein Titelfeld. Der eingegebene Titel wird nicht gedruckt."
          : titleSize < 10
            ? "Der Titel wurde stark verkleinert. Bitte kürzen Sie ihn und prüfen Sie den Umschlag."
            : "Der Titel wurde an das Textfeld des Umschlags angepasst.",
    },
  ];
  const subtitleSize = sizes.get("BOOK_SUBTITLE");
  if (details.subtitle?.trim() && subtitleSize !== undefined) {
    checks.push({
      code: "cover-subtitle",
      status: subtitleSize >= 10 ? "passed" : "warning",
      message:
        subtitleSize < 10
          ? "Der Untertitel wurde stark verkleinert. Bitte kürzen Sie ihn und prüfen Sie den Umschlag."
          : "Der Untertitel wird auf den Umschlag gedruckt.",
    });
  }
  return checks;
}
