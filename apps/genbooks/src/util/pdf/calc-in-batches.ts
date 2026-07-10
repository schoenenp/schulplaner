/**
 * Calculates the total cost of printing a batch of books in batches, considering bleed, imposition on SRA3 sheets,
 * batch-based production (print blocks), and volume-based pricing discounts. The cost is returned in the main
 * currency unit (e.g., Euros), converted from cents. The calculation ensures that costs are based on full print
 * blocks, charging for full batches even if the requested amount is less.
 *
 * @param calcObject - The input object containing printing specifications.
 * @returns The total cost for the batch of books.
 */
export function calculatePrintCost(calcObject: CalcObject): number {
  const { amount, bPages, cPages, format, prices } = calcObject;

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
  const booksPerImposition = Math.max(fitNormal, fitRotated);

  const numberOfBlocks = Math.ceil(amount / booksPerImposition);
  const totalBooksToProduce = numberOfBlocks * booksPerImposition;

  const bSRA3SheetsPerBlock = Math.ceil(bPages / booksPerImposition);
  const cSRA3SheetsPerBlock = Math.ceil(cPages / booksPerImposition);

  const saturationAmount = 300;

  const clampedAmount = Math.min(totalBooksToProduce, saturationAmount);

  const progress = (clampedAmount - 1) / (saturationAmount - 1);

  const effectiveBPrice =
    prices.b.max * (1 - progress) + prices.b.min * progress;
  const effectiveCPrice =
    prices.c.max * (1 - progress) + prices.c.min * progress;


  const costOfOneBlock =
    bSRA3SheetsPerBlock * effectiveBPrice + cSRA3SheetsPerBlock * effectiveCPrice;

  const totalCostCents = costOfOneBlock * numberOfBlocks;
  const totalCost = totalCostCents

  return totalCost;
}

type CalcObject = {
  amount: number;
  bPages: number;
  cPages: number;
  format: "DIN A4" | "DIN A5";
  prices: {
    b: { min: number; max: number };
    c: { min: number; max: number };
  };
};
