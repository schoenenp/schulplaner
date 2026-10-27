import type { BindingKey } from "./bindings";
import type { PriceBook } from "./price-book";

export type PrintFormat = "DIN A4" | "DIN A5";

export type PlannerCostInput = {
  quantity: number;
  grayscalePages: number;
  colorPages: number;
  format: PrintFormat;
  bindingKey?: BindingKey | null;
};

const SRA3_WIDTH_MM = 320;
const SRA3_HEIGHT_MM = 450;
const BLEED_MM = 6;
const PAGE_SIZES_MM: Record<PrintFormat, { width: number; height: number }> = {
  "DIN A4": { width: 210, height: 297 },
  "DIN A5": { width: 148, height: 210 },
};

/** Pages imposed on one SRA3 sheet, whichever orientation fits more. */
export function pagesPerSheet(format: PrintFormat): number {
  const size = PAGE_SIZES_MM[format];
  if (!size) throw new Error("Invalid format specified");
  const width = size.width + BLEED_MM;
  const height = size.height + BLEED_MM;
  const fitNormal =
    Math.floor(SRA3_WIDTH_MM / width) * Math.floor(SRA3_HEIGHT_MM / height);
  const fitRotated =
    Math.floor(SRA3_WIDTH_MM / height) * Math.floor(SRA3_HEIGHT_MM / width);
  return Math.max(fitNormal, fitRotated);
}

/**
 * Unrounded price of one planner in cents, including markup and the minimum
 * price. Tiered values move from their single-copy to their bulk value as the
 * quantity approaches `volume.bulkQuantity`.
 */
export function calculateUnitCost(
  { quantity, grayscalePages, colorPages, format, bindingKey }: PlannerCostInput,
  book: PriceBook,
): number {
  const perSheet = pagesPerSheet(format);
  const grayscaleSheets = Math.ceil(grayscalePages / perSheet);
  const colorSheets = Math.ceil(colorPages / perSheet);

  const { bulkQuantity, curve } = book.volume;
  const progress = Math.min(
    1,
    Math.max(0, (Math.min(quantity, bulkQuantity) - 1) / (bulkQuantity - 1)),
  );
  const tier = (single: number, bulk: number) =>
    single - (single - bulk) * Math.pow(progress, curve);

  const productionCost =
    grayscaleSheets *
      tier(book.sheets.grayscale.singleCents, book.sheets.grayscale.bulkCents) +
    colorSheets * tier(book.sheets.color.singleCents, book.sheets.color.bulkCents) +
    (bindingKey ? book.bindings[bindingKey] : 0);
  const markup = tier(book.margin.singlePercent, book.margin.bulkPercent);

  return Math.max(productionCost * (1 + markup / 100), book.minimumUnitCents);
}

/** The amounts the shop charges: rounded down per planner and in total. */
export function quotePlanner(
  input: PlannerCostInput,
  book: PriceBook,
): { single: number; total: number } {
  const unitCost = calculateUnitCost(input, book);
  return {
    single: Math.floor(unitCost),
    total: Math.floor(unitCost * input.quantity),
  };
}
