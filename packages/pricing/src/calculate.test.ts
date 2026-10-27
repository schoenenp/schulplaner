import { describe, expect, it } from "bun:test";

import { findBindingByName, type BindingKey } from "./bindings";
import { calculateUnitCost, pagesPerSheet, quotePlanner, type PrintFormat } from "./calculate";
import { DEFAULT_PRICE_BOOK } from "./price-book";

// Frozen copy of the calculator and constants that were hard-coded in
// apps/genbooks before the price book. The defaults must charge the same.
function legacyCalculatePrintCost(
  amount: number,
  bPages: number,
  cPages: number,
  format: PrintFormat,
  bindingPrice: number | null,
) {
  const prices = { b: { min: 2, max: 6 }, c: { min: 8, max: 15 } };
  const percentage = { min: 75, max: 200 };
  const [pageWidth, pageHeight] = format === "DIN A4" ? [210, 297] : [148, 210];
  const widthWithBleed = pageWidth + 6;
  const heightWithBleed = pageHeight + 6;
  const pagesPerSheet = Math.max(
    Math.floor(320 / widthWithBleed) * Math.floor(450 / heightWithBleed),
    Math.floor(320 / heightWithBleed) * Math.floor(450 / widthWithBleed),
  );
  const sheetsB = Math.ceil(bPages / pagesPerSheet);
  const sheetsC = Math.ceil(cPages / pagesPerSheet);
  const progress = (Math.min(amount, 300) - 1) / (300 - 1);
  const interpolate = (min: number, max: number) =>
    max - (max - min) * Math.pow(progress, 0.675);
  const multiplier = 1 + interpolate(percentage.min, percentage.max) / 100;
  const cost =
    sheetsB * interpolate(prices.b.min, prices.b.max) +
    sheetsC * interpolate(prices.c.min, prices.c.max) +
    (bindingPrice ?? 0);
  const single = Math.max(cost * multiplier, 200);
  return { single: Math.floor(single), total: Math.floor(single * amount) };
}

const LEGACY_BINDING_PRICES: Record<BindingKey, number> = {
  klammerheftung: 25,
  kunststoffspirale: 50,
  "hot-melt": 60,
};

describe("calculateUnitCost", () => {
  it("imposes four A5 or two A4 pages per SRA3 sheet", () => {
    expect(pagesPerSheet("DIN A5")).toBe(4);
    expect(pagesPerSheet("DIN A4")).toBe(2);
  });

  it("charges exactly what the hard-coded calculator charged", () => {
    const quantities = [1, 2, 5, 10, 25, 49, 50, 99, 100, 150, 299, 300, 301, 1000];
    const pageCounts: Array<[number, number]> = [
      [0, 0],
      [4, 0],
      [96, 4],
      [150, 8],
      [161, 3],
      [240, 0],
      [0, 120],
      [312, 40],
    ];
    const bindings: Array<BindingKey | null> = [
      null,
      "klammerheftung",
      "kunststoffspirale",
      "hot-melt",
    ];
    let compared = 0;
    for (const format of ["DIN A5", "DIN A4"] as const) {
      for (const quantity of quantities) {
        for (const [grayscalePages, colorPages] of pageCounts) {
          for (const bindingKey of bindings) {
            expect(
              quotePlanner(
                { quantity, grayscalePages, colorPages, format, bindingKey },
                DEFAULT_PRICE_BOOK,
              ),
            ).toEqual(
              legacyCalculatePrintCost(
                quantity,
                grayscalePages,
                colorPages,
                format,
                bindingKey ? LEGACY_BINDING_PRICES[bindingKey] : null,
              ),
            );
            compared++;
          }
        }
      }
    }
    expect(compared).toBe(2 * 14 * 8 * 4);
  });

  it("uses single-copy prices for one copy and bulk prices from the bulk quantity on", () => {
    const book = {
      ...DEFAULT_PRICE_BOOK,
      margin: { singlePercent: 0, bulkPercent: 0 },
      minimumUnitCents: 0,
    };
    const input = { grayscalePages: 40, colorPages: 0, format: "DIN A5" as const };
    // 40 pages = 10 sheets.
    expect(calculateUnitCost({ ...input, quantity: 1 }, book)).toBe(60);
    expect(calculateUnitCost({ ...input, quantity: 300 }, book)).toBe(20);
    expect(calculateUnitCost({ ...input, quantity: 5000 }, book)).toBe(20);
  });

  it("applies the minimum price per planner", () => {
    expect(
      quotePlanner(
        { quantity: 10, grayscalePages: 4, colorPages: 0, format: "DIN A5" },
        { ...DEFAULT_PRICE_BOOK, minimumUnitCents: 499 },
      ),
    ).toEqual({ single: 499, total: 4990 });
  });

  it("follows edited prices", () => {
    const input = {
      quantity: 1,
      grayscalePages: 0,
      colorPages: 4,
      format: "DIN A5" as const,
      bindingKey: "hot-melt" as const,
    };
    const edited = {
      ...DEFAULT_PRICE_BOOK,
      sheets: { ...DEFAULT_PRICE_BOOK.sheets, color: { singleCents: 100, bulkCents: 50 } },
      bindings: { ...DEFAULT_PRICE_BOOK.bindings, "hot-melt": 150 },
      margin: { singlePercent: 100, bulkPercent: 50 },
      minimumUnitCents: 0,
    };
    // (1 colour sheet * 100 + 150 binding) * 2
    expect(quotePlanner(input, edited)).toEqual({ single: 500, total: 500 });
  });
});

describe("findBindingByName", () => {
  it("matches module names regardless of case, umlauts and punctuation", () => {
    expect(findBindingByName("Rücken-Heftklammer")?.key).toBe("klammerheftung");
    expect(findBindingByName("PLAST-O-BIND Spirale")?.key).toBe("kunststoffspirale");
    expect(findBindingByName("Leimbindung")?.key).toBe("hot-melt");
    expect(findBindingByName("Ringbuch")).toBeNull();
    expect(findBindingByName("  ")).toBeNull();
  });
});
