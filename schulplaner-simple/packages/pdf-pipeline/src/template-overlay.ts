import {
  ColorTypes,
  StandardFonts,
  TextAlignment,
  cmyk,
  grayscale,
  rgb,
  type Color,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
  type PDFWidgetAnnotation,
} from "pdf-lib";
import { logger } from "./logger";

/**
 * Utilities to render template form-field text directly onto pages instead of
 * the fill-form-and-flatten cycle. The layout math mirrors pdf-lib's internal
 * appearance generation (api/form/appearances.ts + api/text/layout.ts) so a
 * drawn overlay lands exactly where a flattened field appearance would have:
 * same DA parsing, same `borderWidth + padding` bounds inset, same single-line
 * centering formula, same auto-size search. pdf-lib always renders flattened
 * text with its fallback Helvetica regardless of the DA font name, so using
 * Helvetica here reproduces the previous output rather than diverging from it.
 *
 * Not supported (planner templates don't use them): rotated widgets, comb
 * fields, rich text. Multiline fields get a top-aligned approximation.
 */

// Same patterns pdf-lib uses to read font size and color from /DA strings.
const TF_REGEX =
  /\/([^\0\t\n\f\r ]+)[\0\t\n\f\r ]+(\d*\.\d+|\d+)[\0\t\n\f\r ]+Tf/g;
const COLOR_REGEX =
  /(\d*\.\d+|\d+)[\0\t\n\f\r ]*(\d*\.\d+|\d+)?[\0\t\n\f\r ]*(\d*\.\d+|\d+)?[\0\t\n\f\r ]*(\d*\.\d+|\d+)?[\0\t\n\f\r ]+(g|rg|k)/g;

const MIN_AUTO_FONT_SIZE = 4;
const MAX_AUTO_FONT_SIZE = 500;

export interface OverlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayFieldSpec {
  fieldName: string;
  /** 0-based page index within the template document. */
  pageIndex: number;
  /** Text bounds in absolute page coordinates (widget rect inset like pdf-lib). */
  bounds: OverlayBounds;
  /** Explicit DA font size; undefined or 0 means auto-size to the bounds. */
  fontSize?: number;
  color: Color;
  alignment: TextAlignment;
  multiline: boolean;
}

function findLastMatch(value: string, regex: RegExp): RegExpExecArray | null {
  regex.lastIndex = 0;
  let last: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) {
    last = match;
    if (match.index === regex.lastIndex) regex.lastIndex += 1;
  }
  return last;
}

function parseFontSizeFromDa(da: string | undefined): number | undefined {
  if (!da) return undefined;
  const match = findLastMatch(da, TF_REGEX);
  if (!match?.[2]) return undefined;
  const size = Number(match[2]);
  return Number.isFinite(size) ? size : undefined;
}

function parseColorFromDa(da: string | undefined): Color | undefined {
  if (!da) return undefined;
  const match = findLastMatch(da, COLOR_REGEX);
  if (!match) return undefined;
  const [, c1, c2, c3, c4, operator] = match;
  const nums = [c1, c2, c3, c4].map((value) =>
    value === undefined ? undefined : Number(value),
  );
  if (operator === "g" && nums[0] !== undefined) return grayscale(nums[0]);
  if (
    operator === "rg" &&
    nums[0] !== undefined &&
    nums[1] !== undefined &&
    nums[2] !== undefined
  ) {
    return rgb(nums[0], nums[1], nums[2]);
  }
  if (
    operator === "k" &&
    nums[0] !== undefined &&
    nums[1] !== undefined &&
    nums[2] !== undefined &&
    nums[3] !== undefined
  ) {
    return cmyk(nums[0], nums[1], nums[2], nums[3]);
  }
  return undefined;
}

function getWidgetPageIndex(
  doc: PDFDocument,
  widget: PDFWidgetAnnotation,
): number | undefined {
  const pages = doc.getPages();
  const pageRef = widget.P();
  if (pageRef) {
    const byRef = pages.findIndex((page) => page.ref === pageRef);
    if (byRef >= 0) return byRef;
  }
  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const annots = pages[pageIdx]?.node.Annots();
    if (!annots) continue;
    for (let annotIdx = 0; annotIdx < annots.size(); annotIdx++) {
      if (annots.lookup(annotIdx) === widget.dict) return pageIdx;
    }
  }
  return undefined;
}

/**
 * Read the geometry and text styling of the given form fields from a template
 * document. Fields that don't exist (or aren't text fields) are skipped, same
 * as the old fill-and-flatten path silently skipped missing fields.
 */
export function readTemplateFieldSpecs(
  templateDoc: PDFDocument,
  fieldNames: string[],
): Map<string, OverlayFieldSpec[]> {
  const specs = new Map<string, OverlayFieldSpec[]>();
  let form;
  try {
    form = templateDoc.getForm();
  } catch {
    return specs;
  }

  for (const fieldName of fieldNames) {
    let field;
    try {
      field = form.getTextField(fieldName);
    } catch {
      continue;
    }

    const fieldDa = field.acroField.getDefaultAppearance();
    const fieldSpecs: OverlayFieldSpec[] = [];

    for (const widget of field.acroField.getWidgets()) {
      const pageIndex = getWidgetPageIndex(templateDoc, widget);
      if (pageIndex === undefined) {
        logger.warn("pdf_overlay_widget_page_not_found", { fieldName });
        continue;
      }

      const rect = widget.getRectangle();
      const widgetDa = widget.getDefaultAppearance();
      const borderWidth = widget.getBorderStyle()?.getWidth() ?? 0;
      const padding = field.isCombed() ? 0 : 1;
      const inset = borderWidth + padding;

      fieldSpecs.push({
        fieldName,
        pageIndex,
        bounds: {
          x: rect.x + inset,
          y: rect.y + inset,
          width: rect.width - inset * 2,
          height: rect.height - inset * 2,
        },
        fontSize:
          parseFontSizeFromDa(widgetDa) ?? parseFontSizeFromDa(fieldDa),
        color:
          parseColorFromDa(widgetDa) ??
          parseColorFromDa(fieldDa) ??
          rgb(0, 0, 0),
        alignment: field.getAlignment(),
        multiline: field.isMultiline(),
      });
    }

    if (fieldSpecs.length > 0) specs.set(fieldName, fieldSpecs);
  }

  return specs;
}

function cleanOverlayText(text: string): string {
  return text.replace(/\t/g, "    ").replace(/[\r\n\f\v\b]/g, " ");
}

/** Drop characters the font cannot encode instead of failing the generation. */
function encodeSafely(font: PDFFont, text: string): string {
  try {
    font.encodeText(text);
    return text;
  } catch {
    const kept = Array.from(text).filter((char) => {
      try {
        font.encodeText(char);
        return true;
      } catch {
        return false;
      }
    });
    const sanitized = kept.join("");
    logger.warn("pdf_overlay_unencodable_chars_dropped", {
      original: text,
      sanitized,
    });
    return sanitized;
  }
}

/** Same search pdf-lib's computeFontSize performs for auto-sized fields. */
export function computeAutoFontSize(
  text: string,
  font: PDFFont,
  bounds: OverlayBounds,
): number {
  let fontSize = MIN_AUTO_FONT_SIZE;
  while (fontSize < MAX_AUTO_FONT_SIZE) {
    let linesUsed = 1;
    let spaceInLineRemaining = bounds.width;
    const words = text.split(" ");
    for (let idx = 0; idx < words.length; idx++) {
      const isLastWord = idx === words.length - 1;
      const word = isLastWord ? words[idx]! : `${words[idx]!} `;
      const widthOfWord = font.widthOfTextAtSize(word, fontSize);
      spaceInLineRemaining -= widthOfWord;
      if (spaceInLineRemaining <= 0) {
        linesUsed += 1;
        spaceInLineRemaining = bounds.width - widthOfWord;
      }
    }
    if (linesUsed > 1) return fontSize - 1;
    const height = font.heightAtSize(fontSize);
    const lineHeight = height + height * 0.2;
    if (lineHeight * linesUsed > Math.abs(bounds.height)) return fontSize - 1;
    fontSize += 1;
  }
  return fontSize;
}

export interface OverlayLayout {
  x: number;
  y: number;
  fontSize: number;
}

/** Mirror of pdf-lib's layoutSinglelineText position math, in page coords. */
export function computeOverlayLayout(
  text: string,
  spec: Pick<OverlayFieldSpec, "bounds" | "fontSize" | "alignment">,
  font: PDFFont,
): OverlayLayout {
  const { bounds, alignment } = spec;
  const fontSize =
    spec.fontSize && spec.fontSize > 0
      ? spec.fontSize
      : computeAutoFontSize(text, font, bounds);

  const width = font.widthOfTextAtSize(text, fontSize);
  const height = font.heightAtSize(fontSize, { descender: false });

  const x =
    alignment === TextAlignment.Center
      ? bounds.x + bounds.width / 2 - width / 2
      : alignment === TextAlignment.Right
        ? bounds.x + bounds.width - width
        : bounds.x;
  const y = bounds.y + bounds.height / 2 - height / 2;

  return { x, y, fontSize };
}

function toGrayscaleColor(color: Color): Color {
  switch (color.type) {
    case ColorTypes.Grayscale:
      return color;
    case ColorTypes.RGB:
      return grayscale(
        0.299 * color.red + 0.587 * color.green + 0.114 * color.blue,
      );
    case ColorTypes.CMYK: {
      const luminance =
        0.299 * color.cyan + 0.587 * color.magenta + 0.114 * color.yellow;
      return grayscale(1 - Math.min(1, luminance + color.key));
    }
    default:
      return color;
  }
}

export interface DrawFieldTextOptions {
  /** Convert the DA color to gray so overlays match grayscale-converted art. */
  forceGrayscale?: boolean;
}

/**
 * Draw one field value on a page at the position a flattened form appearance
 * would have used.
 */
export function drawFieldText(
  page: PDFPage,
  spec: OverlayFieldSpec,
  text: string,
  font: PDFFont,
  options: DrawFieldTextOptions = {},
): void {
  const cleaned = cleanOverlayText(text);
  if (!cleaned) return;
  const safeText = encodeSafely(font, cleaned);
  if (!safeText) return;

  const color = options.forceGrayscale
    ? toGrayscaleColor(spec.color)
    : spec.color;

  if (spec.multiline) {
    drawMultilineFieldText(page, spec, safeText, font, color);
    return;
  }

  const layout = computeOverlayLayout(safeText, spec, font);
  page.drawText(safeText, {
    x: layout.x,
    y: layout.y,
    size: layout.fontSize,
    font,
    color,
  });
}

/**
 * Top-aligned word-wrap approximation for multiline fields. Planner tags are
 * single-line in practice; this keeps unexpected multiline fields readable.
 */
function drawMultilineFieldText(
  page: PDFPage,
  spec: OverlayFieldSpec,
  text: string,
  font: PDFFont,
  color: Color,
): void {
  const { bounds } = spec;
  const fontSize =
    spec.fontSize && spec.fontSize > 0
      ? spec.fontSize
      : computeAutoFontSize(text, font, bounds);
  const lineHeight = font.heightAtSize(fontSize) * 1.2;

  const lines: string[] = [];
  let currentLine = "";
  for (const word of text.split(" ")) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (
      currentLine &&
      font.widthOfTextAtSize(candidate, fontSize) > bounds.width
    ) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine) lines.push(currentLine);

  const height = font.heightAtSize(fontSize, { descender: false });
  lines.forEach((line, index) => {
    const y = bounds.y + bounds.height - height - index * lineHeight;
    if (y < bounds.y - lineHeight) return;
    page.drawText(line, { x: bounds.x, y, size: fontSize, font, color });
  });
}

const overlayFontCache = new WeakMap<PDFDocument, Promise<PDFFont>>();

/**
 * Embed the overlay font once per output document. pdf-lib's flatten used its
 * Helvetica fallback for every flattened week, so one shared Helvetica both
 * matches the old rendering and stores the font a single time.
 */
export function getOverlayFont(doc: PDFDocument): Promise<PDFFont> {
  let cached = overlayFontCache.get(doc);
  if (!cached) {
    cached = doc.embedFont(StandardFonts.Helvetica);
    overlayFontCache.set(doc, cached);
  }
  return cached;
}
