import { z } from "zod";

import { BINDINGS, BINDING_KEYS, type BindingKey } from "./bindings";

// All amounts are EUR cents. Every tiered value has a price for a single copy
// and one that applies from `volume.bulkQuantity` copies on; quantities in
// between follow the discount curve (see calculate.ts).

const hasAtMostDecimals = (places: number) => (value: number) => {
  const factor = 10 ** places;
  return Math.abs(value * factor - Math.round(value * factor)) < 1e-6;
};

const sheetCents = z
  .number()
  .finite()
  .min(0, "Der Preis darf nicht negativ sein.")
  .max(1000, "Höchstens 1000 ct pro Bogen.")
  .refine(hasAtMostDecimals(2), "Höchstens zwei Nachkommastellen.");

const wholeCents = (max: number) =>
  z
    .number()
    .int("Bitte ganze Cent angeben.")
    .min(0, "Der Preis darf nicht negativ sein.")
    .max(max, `Höchstens ${max} ct.`);

const percent = z
  .number()
  .finite()
  .min(0, "Der Aufschlag darf nicht negativ sein.")
  .max(1000, "Höchstens 1000 %.")
  .refine(hasAtMostDecimals(2), "Höchstens zwei Nachkommastellen.");

const sheetPriceSchema = z
  .object({ singleCents: sheetCents, bulkCents: sheetCents })
  .refine((price) => price.bulkCents <= price.singleCents, {
    message: "Der Staffelpreis darf nicht über dem Einzelpreis liegen.",
    path: ["bulkCents"],
  });

const bindingPricesSchema = z.object(
  Object.fromEntries(BINDING_KEYS.map((key) => [key, wholeCents(10_000)])) as Record<
    BindingKey,
    ReturnType<typeof wholeCents>
  >,
);

export const priceBookSchema = z.object({
  /** Per SRA3 sheet printed. */
  sheets: z.object({
    grayscale: sheetPriceSchema,
    color: sheetPriceSchema,
  }),
  /** Fixed surcharge per planner. */
  bindings: bindingPricesSchema,
  /** Markup on the production cost. */
  margin: z
    .object({ singlePercent: percent, bulkPercent: percent })
    .refine((margin) => margin.bulkPercent <= margin.singlePercent, {
      message: "Der Staffelaufschlag darf nicht über dem Einzelaufschlag liegen.",
      path: ["bulkPercent"],
    }),
  volume: z.object({
    bulkQuantity: z
      .number()
      .int("Bitte eine ganze Stückzahl angeben.")
      .min(2, "Die Staffelmenge muss mindestens 2 sein.")
      .max(5000, "Höchstens 5000 Exemplare."),
    /** Exponent of the discount curve; below 1 the discount sets in early. */
    curve: z
      .number()
      .finite()
      .min(0.1, "Die Kurve muss zwischen 0,1 und 5 liegen.")
      .max(5, "Die Kurve muss zwischen 0,1 und 5 liegen.")
      .refine(hasAtMostDecimals(3), "Höchstens drei Nachkommastellen."),
  }),
  minimumUnitCents: wholeCents(100_000),
  shipping: z.object({
    standardCents: wholeCents(100_000),
    expressCents: wholeCents(100_000),
  }),
});

export type PriceBook = z.infer<typeof priceBookSchema>;

/** The prices that were hard-coded before the price book existed. */
export const DEFAULT_PRICE_BOOK: PriceBook = {
  sheets: {
    grayscale: { singleCents: 6, bulkCents: 2 },
    color: { singleCents: 15, bulkCents: 8 },
  },
  bindings: {
    klammerheftung: 25,
    kunststoffspirale: 50,
    "hot-melt": 60,
  },
  margin: { singlePercent: 200, bulkPercent: 75 },
  volume: { bulkQuantity: 300, curve: 0.675 },
  minimumUnitCents: 200,
  shipping: { standardCents: 1000, expressCents: 3000 },
};

export function parsePriceBook(value: unknown): PriceBook {
  return priceBookSchema.parse(value);
}

/** What the panel serves to the shop. */
export const priceBookPayloadSchema = z.object({
  version: z.number().int().positive(),
  updatedAt: z.string().min(1),
  priceBook: priceBookSchema,
});

export type PriceBookPayload = z.infer<typeof priceBookPayloadSchema>;

export type PriceFieldUnit =
  | "sheet-cents"
  | "cents"
  | "euro-cents"
  | "percent"
  | "quantity"
  | "factor";

export type PriceField = {
  id: string;
  label: string;
  unit: PriceFieldUnit;
  read: (book: PriceBook) => number;
};

export const PRICE_FIELDS: PriceField[] = [
  {
    id: "sheets.grayscale.singleCents",
    label: "S/W-Bogen bei 1 Exemplar",
    unit: "sheet-cents",
    read: (book) => book.sheets.grayscale.singleCents,
  },
  {
    id: "sheets.grayscale.bulkCents",
    label: "S/W-Bogen ab Staffelmenge",
    unit: "sheet-cents",
    read: (book) => book.sheets.grayscale.bulkCents,
  },
  {
    id: "sheets.color.singleCents",
    label: "Farbbogen bei 1 Exemplar",
    unit: "sheet-cents",
    read: (book) => book.sheets.color.singleCents,
  },
  {
    id: "sheets.color.bulkCents",
    label: "Farbbogen ab Staffelmenge",
    unit: "sheet-cents",
    read: (book) => book.sheets.color.bulkCents,
  },
  ...BINDINGS.map(
    (binding): PriceField => ({
      id: `bindings.${binding.key}`,
      label: `Bindung ${binding.label}`,
      unit: "cents",
      read: (book) => book.bindings[binding.key],
    }),
  ),
  {
    id: "margin.singlePercent",
    label: "Aufschlag bei 1 Exemplar",
    unit: "percent",
    read: (book) => book.margin.singlePercent,
  },
  {
    id: "margin.bulkPercent",
    label: "Aufschlag ab Staffelmenge",
    unit: "percent",
    read: (book) => book.margin.bulkPercent,
  },
  {
    id: "volume.bulkQuantity",
    label: "Staffelmenge",
    unit: "quantity",
    read: (book) => book.volume.bulkQuantity,
  },
  {
    id: "volume.curve",
    label: "Rabattkurve",
    unit: "factor",
    read: (book) => book.volume.curve,
  },
  {
    id: "minimumUnitCents",
    label: "Mindestpreis pro Planer",
    unit: "euro-cents",
    read: (book) => book.minimumUnitCents,
  },
  {
    id: "shipping.standardCents",
    label: "Standardversand",
    unit: "euro-cents",
    read: (book) => book.shipping.standardCents,
  },
  {
    id: "shipping.expressCents",
    label: "Expressversand",
    unit: "euro-cents",
    read: (book) => book.shipping.expressCents,
  },
];

export type PriceChange = {
  id: string;
  label: string;
  unit: PriceFieldUnit;
  before: number;
  after: number;
};

export function diffPriceBooks(before: PriceBook, after: PriceBook): PriceChange[] {
  return PRICE_FIELDS.flatMap((field) => {
    const previous = field.read(before);
    const next = field.read(after);
    return previous === next
      ? []
      : [{ id: field.id, label: field.label, unit: field.unit, before: previous, after: next }];
  });
}

const decimalFormat = (maximumFractionDigits: number) =>
  new Intl.NumberFormat("de-DE", { maximumFractionDigits });
const euroFormat = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

export function formatPriceFieldValue(value: number, unit: PriceFieldUnit): string {
  switch (unit) {
    case "sheet-cents":
    case "cents":
      return `${decimalFormat(2).format(value)} ct`;
    case "euro-cents":
      return euroFormat.format(value / 100);
    case "percent":
      return `${decimalFormat(2).format(value)} %`;
    case "quantity":
      return `${decimalFormat(0).format(value)} Ex.`;
    case "factor":
      return decimalFormat(3).format(value);
  }
}
