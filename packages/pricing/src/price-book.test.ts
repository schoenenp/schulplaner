import { describe, expect, it } from "bun:test";

import {
  DEFAULT_PRICE_BOOK,
  diffPriceBooks,
  formatPriceFieldValue,
  parsePriceBook,
  priceBookPayloadSchema,
} from "./price-book";

describe("price book validation", () => {
  it("accepts the defaults and fractional sheet prices", () => {
    expect(parsePriceBook(DEFAULT_PRICE_BOOK)).toEqual(DEFAULT_PRICE_BOOK);
    const fractional = {
      ...DEFAULT_PRICE_BOOK,
      sheets: { ...DEFAULT_PRICE_BOOK.sheets, grayscale: { singleCents: 5.5, bulkCents: 1.25 } },
    };
    expect(parsePriceBook(fractional).sheets.grayscale.bulkCents).toBe(1.25);
  });

  it("rejects bulk prices above single-copy prices", () => {
    expect(() =>
      parsePriceBook({
        ...DEFAULT_PRICE_BOOK,
        sheets: { ...DEFAULT_PRICE_BOOK.sheets, color: { singleCents: 8, bulkCents: 15 } },
      }),
    ).toThrow("Staffelpreis");
    expect(() =>
      parsePriceBook({ ...DEFAULT_PRICE_BOOK, margin: { singlePercent: 75, bulkPercent: 200 } }),
    ).toThrow("Staffelaufschlag");
  });

  it("rejects missing bindings, fractional whole-cent fields and bad quantities", () => {
    const { klammerheftung: _removed, ...bindings } = DEFAULT_PRICE_BOOK.bindings;
    expect(() => parsePriceBook({ ...DEFAULT_PRICE_BOOK, bindings })).toThrow();
    expect(() =>
      parsePriceBook({ ...DEFAULT_PRICE_BOOK, minimumUnitCents: 199.5 }),
    ).toThrow("ganze Cent");
    expect(() =>
      parsePriceBook({ ...DEFAULT_PRICE_BOOK, volume: { bulkQuantity: 1, curve: 0.675 } }),
    ).toThrow("mindestens 2");
    expect(() =>
      parsePriceBook({
        ...DEFAULT_PRICE_BOOK,
        sheets: { ...DEFAULT_PRICE_BOOK.sheets, grayscale: { singleCents: 6.123, bulkCents: 2 } },
      }),
    ).toThrow("Nachkommastellen");
  });

  it("validates the payload the panel serves", () => {
    expect(
      priceBookPayloadSchema.parse({
        version: 3,
        updatedAt: "2026-10-27T12:00:00.000Z",
        priceBook: DEFAULT_PRICE_BOOK,
      }).version,
    ).toBe(3);
    expect(() =>
      priceBookPayloadSchema.parse({ version: 3, updatedAt: "x", priceBook: {} }),
    ).toThrow();
  });
});

describe("diffPriceBooks", () => {
  it("lists changed fields with labels", () => {
    const changes = diffPriceBooks(DEFAULT_PRICE_BOOK, {
      ...DEFAULT_PRICE_BOOK,
      bindings: { ...DEFAULT_PRICE_BOOK.bindings, kunststoffspirale: 55 },
      shipping: { ...DEFAULT_PRICE_BOOK.shipping, standardCents: 1290 },
    });
    expect(changes).toEqual([
      {
        id: "bindings.kunststoffspirale",
        label: "Bindung Kunststoffspirale",
        unit: "cents",
        before: 50,
        after: 55,
      },
      {
        id: "shipping.standardCents",
        label: "Standardversand",
        unit: "euro-cents",
        before: 1000,
        after: 1290,
      },
    ]);
    expect(diffPriceBooks(DEFAULT_PRICE_BOOK, DEFAULT_PRICE_BOOK)).toEqual([]);
  });

  it("formats values in their unit", () => {
    expect(formatPriceFieldValue(5.5, "sheet-cents")).toBe("5,5 ct");
    expect(formatPriceFieldValue(1290, "euro-cents")).toBe("12,90\u00a0€");
    expect(formatPriceFieldValue(75, "percent")).toBe("75 %");
    expect(formatPriceFieldValue(300, "quantity")).toBe("300 Ex.");
    expect(formatPriceFieldValue(0.675, "factor")).toBe("0,675");
  });
});
