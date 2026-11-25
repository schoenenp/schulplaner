import { z } from "zod";

/** Gross price per planner from a minimum quantity on. */
export const PriceTierSchema = z.object({
  minQuantity: z.number().int().min(1),
  unitAmount: z.number().int().min(0),
});
export type PriceTier = z.infer<typeof PriceTierSchema>;

export const PriceTiersSchema = z
  .array(PriceTierSchema)
  .min(1)
  .transform((tiers) =>
    [...tiers].sort((a, b) => a.minQuantity - b.minQuantity),
  )
  .refine(
    (tiers) =>
      new Set(tiers.map((tier) => tier.minQuantity)).size === tiers.length,
    "Jede Staffel braucht eine eigene Mindestmenge.",
  );

export type PriceList = {
  priceTiers: PriceTier[];
  shippingAmount: number;
  freeShippingAt: number | null;
  minQuantity: number;
  vatBasisPoints: number;
};

export type Quote = {
  quantity: number;
  unitAmount: number;
  subtotalAmount: number;
  shippingAmount: number;
  totalAmount: number;
  /** VAT contained in the gross total. */
  vatAmount: number;
};

export function parsePriceTiers(value: unknown): PriceTier[] {
  const parsed = PriceTiersSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** The tier with the highest minimum quantity the order reaches. */
export function unitAmountFor(quantity: number, tiers: PriceTier[]) {
  let unit: number | undefined;
  for (const tier of [...tiers].sort((a, b) => a.minQuantity - b.minQuantity)) {
    if (quantity >= tier.minQuantity) unit = tier.unitAmount;
  }
  return unit ?? tiers[0]?.unitAmount;
}

export function quote(quantity: number, prices: PriceList): Quote | null {
  if (!Number.isInteger(quantity) || quantity < prices.minQuantity) return null;
  const unitAmount = unitAmountFor(quantity, prices.priceTiers);
  if (unitAmount === undefined) return null;
  const subtotalAmount = unitAmount * quantity;
  const shippingAmount =
    prices.freeShippingAt !== null && quantity >= prices.freeShippingAt
      ? 0
      : prices.shippingAmount;
  const totalAmount = subtotalAmount + shippingAmount;
  const vatAmount = Math.round(
    totalAmount - totalAmount / (1 + prices.vatBasisPoints / 10000),
  );
  return {
    quantity,
    unitAmount,
    subtotalAmount,
    shippingAmount,
    totalAmount,
    vatAmount,
  };
}
