import { getBindingPriceOverrideByName } from "@/util/book/binding-rules";

type CalcObject = {
  amount: number;
  bPages: number;
  cPages: number;
  format: "DIN A4" | "DIN A5";
  bindingName?: string;
  prices: {
    b: { min: number; max: number };
    c: { min: number; max: number };
  };
  percentage?: number | { min: number; max: number };
};

export function calculatePrintCost({
  amount,
  bPages,
  cPages,
  format = "DIN A5",
  bindingName,
  prices,
  percentage = { min: 75, max: 200 },
}: CalcObject): { single: number; total: number } {

  const sra3Width = 320;
  const sra3Height = 450;
  const bleedAddition = 6;

  let pageWidth: number;
  let pageHeight: number;
  if (format === "DIN A4") {
    pageWidth = 210;
    pageHeight = 297;
  } else if (format === "DIN A5") {
    pageWidth = 148;
    pageHeight = 210;
  } else {
    throw new Error("Invalid format specified");
  }
  const widthWithBleed = pageWidth + bleedAddition;
  const heightWithBleed = pageHeight + bleedAddition;

  const fitNormal =
    Math.floor(sra3Width / widthWithBleed) *
    Math.floor(sra3Height / heightWithBleed);
  const fitRotated =
    Math.floor(sra3Width / heightWithBleed) *
    Math.floor(sra3Height / widthWithBleed);
  const pagesPerSheet = Math.max(fitNormal, fitRotated);

  const sheetsBPerBook = Math.ceil(bPages / pagesPerSheet);
  const sheetsCPerBook = Math.ceil(cPages / pagesPerSheet);

  const saturationAmount = 300;

  const clampedAmount = Math.min(amount, saturationAmount);

  const progress = (clampedAmount - 1) / (saturationAmount - 1);

  const gamma = 0.675;

  // Helper function for exponential interpolation
  const interpolate = (min: number, max: number, prog: number) =>
    max - (max - min) * Math.pow(prog, gamma);

  const bindingPriceOverride = bindingName
    ? getBindingPriceOverrideByName(bindingName)
    : null;
  const effectiveBindPrice =
    typeof bindingPriceOverride?.fixed === "number"
      ? bindingPriceOverride.fixed
      : typeof bindingPriceOverride?.min === "number" &&
        typeof bindingPriceOverride?.max === "number"
        ? interpolate(
          bindingPriceOverride.min,
          bindingPriceOverride.max,
          progress,
        )
        : 0;
  const effectiveBPrice = interpolate(prices.b.min, prices.b.max, progress);
  const effectiveCPrice = interpolate(prices.c.min, prices.c.max, progress);

  // Calculate effective percentage (interpolated if provided as object)
  let effectivePercentage: number;
  if (typeof percentage === "number") {
    effectivePercentage = percentage;
  } else if (percentage) {
    effectivePercentage = interpolate(
      percentage.min,
      percentage.max,
      progress
    );
  } else {
    effectivePercentage = 0;
  }

  // Convert effective percentage to multiplier
  const multiplier = 1 + effectivePercentage / 100;

  const costPerBookCents =
    sheetsBPerBook * effectiveBPrice +
    sheetsCPerBook * effectiveCPrice +
    effectiveBindPrice;

  const singleCost = Math.max(costPerBookCents * multiplier, 200);
  const totalCost = singleCost * amount;

  return {
    single: Math.floor(singleCost),
    total: Math.floor(totalCost),
  };
}
