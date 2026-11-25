import { describe, expect, it } from "bun:test";
import { PDFDocument, StandardFonts, TextAlignment } from "pdf-lib";
import { fillCoverText } from "./cover-text";
import { readTemplateFieldSpecs } from "./template-overlay";

describe("cover text regression", () => {
  it("fits DeepSeek's title instead of clipping a fixed-size centered field", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const field = doc.getForm().createTextField("BOOK_TITLE");
    field.addToPage(page, {
      x: 60,
      y: 600,
      width: 220,
      height: 30,
      borderWidth: 0,
    });
    field.setFontSize(52);
    field.setAlignment(TextAlignment.Center);
    const checks = await fillCoverText(doc, {
      title: "TEST T02 – DIN A5 × 25",
      period: {},
    });
    const spec = readTemplateFieldSpecs(doc, ["BOOK_TITLE"]).get(
      "BOOK_TITLE",
    )![0]!;
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(spec.fontSize).toBeLessThan(52);
    expect(
      font.widthOfTextAtSize(field.getText()!, spec.fontSize!),
    ).toBeLessThanOrEqual(spec.bounds.width + 0.001);
    expect(
      font.heightAtSize(spec.fontSize!, { descender: false }),
    ).toBeLessThanOrEqual(spec.bounds.height + 0.001);
    expect(checks[0]?.status).toBe("passed");
    doc.getForm().flatten();
    expect(
      (await PDFDocument.load(await doc.save())).getForm().getFields(),
    ).toHaveLength(0);
  });

  it("accepts covers without a subtitle field and prints the subtitle when a field exists", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage();
    const details = {
      title: "Mein Planer",
      subtitle: "Botmail Testschule – ÄÖÜ ß",
      period: {},
    };
    expect(
      (await fillCoverText(doc, details)).find(
        (c) => c.code === "cover-subtitle",
      ),
    ).toBeUndefined();
    const field = doc.getForm().createTextField("BOOK_SUBTITLE");
    field.addToPage(page, { x: 50, y: 500, width: 400, height: 32 });
    const checks = await fillCoverText(doc, details);
    expect(field.getText()).toBe(details.subtitle);
    expect(checks.find((c) => c.code === "cover-subtitle")?.status).toBe(
      "passed",
    );
    await fillCoverText(doc, { ...details, subtitle: "" });
    expect(field.getText() ?? "").toBe("");
  });

  it("warns when fitting makes the title unreadably small", async () => {
    const doc = await PDFDocument.create();
    const field = doc.getForm().createTextField("BOOK_TITLE");
    field.addToPage(doc.addPage(), { x: 40, y: 400, width: 100, height: 20 });
    const checks = await fillCoverText(doc, {
      title: "Sehr langer Schulplanertitel ".repeat(8),
      period: {},
    });
    expect(checks.find((c) => c.code === "cover-title")?.status).toBe(
      "warning",
    );
  });
});
