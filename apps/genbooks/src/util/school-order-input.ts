import { z } from "zod";

export const MAX_SCHOOL_ORDER_QUANTITY = 5000;

const requiredText = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).default("");

const schoolOrderAddress = z.object({
  recipient: requiredText(160),
  extra: optionalText(160),
  street: requiredText(160),
  zip: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9 -]{3,16}$/),
  city: requiredText(120),
  country: z.enum(["DE", "AT"]),
});

export type SchoolOrderAddress = z.infer<typeof schoolOrderAddress>;

export const schoolOrderInput = z.object({
  quantity: z.coerce.number().int().min(1).max(MAX_SCHOOL_ORDER_QUANTITY),
  schoolName: requiredText(160),
  contactName: requiredText(160),
  email: z.string().trim().email().max(254),
  phone: optionalText(40),
  customerNote: optionalText(2000),
  billingAddress: schoolOrderAddress,
  shippingAddress: schoolOrderAddress,
});

export type SchoolOrderInput = z.infer<typeof schoolOrderInput>;

export function schoolOrderAddressLines(address: SchoolOrderAddress) {
  return [
    address.recipient,
    address.extra,
    address.street,
    `${address.zip} ${address.city}`,
    address.country === "AT" ? "Österreich" : "Deutschland",
  ].filter(Boolean);
}

export function formatSchoolOrderPrice(cents: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
