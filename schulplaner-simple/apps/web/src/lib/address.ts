import { z } from "zod";

const text = (max: number) => z.string().trim().min(1, "Pflichtfeld").max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const AddressSchema = z.object({
  name: text(120),
  extra: optionalText(120),
  street: text(120),
  zip: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 -]{3,10}$/, "Ungültige Postleitzahl"),
  city: text(80),
  country: z.enum(["DE", "AT"]),
});
export type Address = z.infer<typeof AddressSchema>;

export function parseAddress(value: unknown): Address | null {
  const parsed = AddressSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function addressLines(address: Address | null) {
  if (!address) return [];
  return [
    address.name,
    address.extra,
    address.street,
    `${address.zip} ${address.city}`,
    address.country === "AT" ? "Österreich" : "Deutschland",
  ].filter((line): line is string => Boolean(line));
}

export const OrderFormSchema = z.object({
  quantity: z.coerce.number().int().min(1).max(10000),
  schoolName: text(160),
  email: z.string().trim().email("Ungültige E-Mail-Adresse").max(200),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[0-9+()\-./\s]*$/, "Ungültige Telefonnummer")
    .optional()
    .transform((value) => value || undefined),
  billing: AddressSchema,
  shipping: AddressSchema,
  customerNote: optionalText(2000),
  acceptTerms: z.literal("on", {
    errorMap: () => ({ message: "Bitte bestätigen Sie die AGB." }),
  }),
});

const ADDRESS_LABELS = {
  name: "Name / Schule",
  street: "Straße und Hausnummer",
  zip: "PLZ",
  city: "Ort",
  country: "Land",
};

export const ORDER_FIELD_LABELS: Record<string, string> = {
  quantity: "Menge",
  schoolName: "Schule",
  email: "E-Mail",
  phone: "Telefon",
  ...Object.fromEntries(
    Object.entries(ADDRESS_LABELS).flatMap(([key, label]) => [
      [`billing.${key}`, `Rechnungsadresse – ${label}`],
      [`shipping.${key}`, `Lieferadresse – ${label}`],
    ]),
  ),
};
