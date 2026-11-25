import { describe, expect, test } from "bun:test";
import { PriceTiersSchema, quote, unitAmountFor, type PriceList } from "./pricing";

const prices: PriceList = {
  priceTiers: [
    { minQuantity: 1, unitAmount: 990 },
    { minQuantity: 50, unitAmount: 790 },
    { minQuantity: 150, unitAmount: 690 },
  ],
  shippingAmount: 1490,
  freeShippingAt: 150,
  minQuantity: 10,
  vatBasisPoints: 1900,
};

describe("planner prices", () => {
  test("uses the highest tier the quantity reaches", () => {
    expect(unitAmountFor(10, prices.priceTiers)).toBe(990);
    expect(unitAmountFor(49, prices.priceTiers)).toBe(990);
    expect(unitAmountFor(50, prices.priceTiers)).toBe(790);
    expect(unitAmountFor(1000, prices.priceTiers)).toBe(690);
  });

  test("adds shipping until the free-shipping quantity", () => {
    expect(quote(100, prices)).toMatchObject({ subtotalAmount: 79000, shippingAmount: 1490, totalAmount: 80490 });
    expect(quote(150, prices)).toMatchObject({ subtotalAmount: 103500, shippingAmount: 0, totalAmount: 103500 });
  });

  test("reports the VAT contained in the gross total", () => {
    // 119,00 € gross at 19 % contains 19,00 € VAT.
    const result = quote(10, { ...prices, priceTiers: [{ minQuantity: 1, unitAmount: 1190 }], shippingAmount: 0 });
    expect(result?.vatAmount).toBe(1900);
  });

  test("rejects quantities below the minimum or not whole", () => {
    expect(quote(9, prices)).toBeNull();
    expect(quote(12.5, prices)).toBeNull();
    expect(quote(Number.NaN, prices)).toBeNull();
  });

  test("never charges shipping-free when no threshold is set", () => {
    expect(quote(5000, { ...prices, freeShippingAt: null })?.shippingAmount).toBe(1490);
  });

  test("sorts tiers and rejects duplicate minimum quantities", () => {
    expect(PriceTiersSchema.parse([{ minQuantity: 50, unitAmount: 1 }, { minQuantity: 1, unitAmount: 2 }])[0]?.minQuantity).toBe(1);
    expect(PriceTiersSchema.safeParse([{ minQuantity: 1, unitAmount: 1 }, { minQuantity: 1, unitAmount: 2 }]).success).toBe(false);
  });
});
