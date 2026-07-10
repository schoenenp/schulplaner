import type { Prisma } from "@prisma/client";
import type Stripe from "stripe";
import { stripeClient } from "@/util/stripe";
import { env } from "@/env";

const STRIPE_GERMAN_LOCALE = "de";
const PARTNER_INVOICE_FOOTER = "in Partnerschaft mit Digitaldruck Pirrot GmbH";
const DEFAULT_PARTNER_EU_LEGAL_TEXT =
  "Leistung gemäß anwendbarem EU-Umsatzsteuerrecht. Steuerliche Behandlung erfolgt nach Leistungsort, Unternehmensstatus und gültiger USt-IdNr.";

export type PartnerSchoolInvoiceInput = {
  partnerOrderId: string;
  partnerUserId: string;
  partnerName: string;
  partnerEmail: string | null;
  schoolSnapshot: Prisma.JsonValue | null;
  lineItemsSnapshot: Prisma.JsonValue | null;
  orderKey?: string | null;
};

export type PartnerIssuerSnapshot = {
  partnerUserId: string;
  partnerName: string;
  partnerEmail: string | null;
  legalFooter: string;
  legalText: string;
  confirmedAt: string;
  invoiceCountryPath: "DE" | "AT" | "EU";
  vatTreatment:
    | "DE_DOMESTIC"
    | "AT_DOMESTIC"
    | "EU_CROSS_BORDER"
    | "EU_GENERIC";
  schoolVatId: string | null;
  eInvoiceCompatibilityPath: "DE_XRECHNUNG_ZUGFERD_PREP" | "AT_EBINTERFACE_PREP" | "EU_GENERIC_PREP";
};

export type PartnerSchoolInvoiceResult = {
  invoiceId: string;
  hostedInvoiceUrl: string | null;
  issuedAt: string;
  issuerSnapshot: PartnerIssuerSnapshot;
};

export function getInvoiceCountryPath(countryCode?: string): "DE" | "AT" | "EU" {
  const normalized = countryCode?.trim().toUpperCase();
  if (normalized === "DE") return "DE";
  if (normalized === "AT") return "AT";
  return "EU";
}

export function getEInvoiceCompatibilityPath(
  countryPath: "DE" | "AT" | "EU",
): PartnerIssuerSnapshot["eInvoiceCompatibilityPath"] {
  if (countryPath === "DE") return "DE_XRECHNUNG_ZUGFERD_PREP";
  if (countryPath === "AT") return "AT_EBINTERFACE_PREP";
  return "EU_GENERIC_PREP";
}

function getPartnerEuLegalText(): string {
  const fromEnv = env.PARTNER_EU_LEGAL_TEXT?.trim();
  return fromEnv && fromEnv.length > 0
    ? fromEnv
    : DEFAULT_PARTNER_EU_LEGAL_TEXT;
}

function getVatTreatment(params: {
  invoiceCountryPath: "DE" | "AT" | "EU";
  schoolVatId?: string;
}): PartnerIssuerSnapshot["vatTreatment"] {
  if (params.invoiceCountryPath === "DE") return "DE_DOMESTIC";
  if (params.invoiceCountryPath === "AT") return "AT_DOMESTIC";
  if (params.schoolVatId && params.schoolVatId.length > 0) {
    return "EU_CROSS_BORDER";
  }
  return "EU_GENERIC";
}

export function buildPartnerIssuerSnapshot(params: {
  partnerUserId: string;
  partnerName: string;
  partnerEmail: string | null;
  schoolCountry?: string;
  schoolVatId?: string;
  confirmedAt?: string;
}): PartnerIssuerSnapshot {
  const invoiceCountryPath = getInvoiceCountryPath(params.schoolCountry);
  const schoolVatId = params.schoolVatId?.trim() ?? "";
  const legalText = getPartnerEuLegalText();
  return {
    partnerUserId: params.partnerUserId,
    partnerName: params.partnerName,
    partnerEmail: params.partnerEmail,
    legalFooter: PARTNER_INVOICE_FOOTER,
    legalText,
    confirmedAt: params.confirmedAt ?? new Date().toISOString(),
    invoiceCountryPath,
    vatTreatment: getVatTreatment({
      invoiceCountryPath,
      schoolVatId,
    }),
    schoolVatId: schoolVatId.length > 0 ? schoolVatId : null,
    eInvoiceCompatibilityPath: getEInvoiceCompatibilityPath(invoiceCountryPath),
  };
}

function asRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function asAddressParam(value: unknown): Stripe.AddressParam | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const city = asString(record, "city");
  const country = asString(record, "country");
  const line1 = asString(record, "line1");
  const line2 = asString(record, "line2");
  const postalCode = asString(record, "postal_code");
  const state = asString(record, "state");

  if (!city && !country && !line1 && !line2 && !postalCode && !state) {
    return undefined;
  }

  return {
    city,
    country,
    line1,
    line2,
    postal_code: postalCode,
    state,
  };
}

function buildOverviewDescription(
  lineItemsSnapshot: Prisma.JsonValue | null,
  orderKey?: string | null,
): string {
  const lineItems = asRecord(lineItemsSnapshot);
  const quantityValue = lineItems.quantity;
  const quantity =
    typeof quantityValue === "number" && Number.isFinite(quantityValue)
      ? quantityValue
      : 1;
  const addOnModules = asString(lineItems, "addOnModules") ?? "keine Zusatzmodule";
  const orderSuffix = orderKey ? ` | Auftrag: ${orderKey}` : "";
  return `${quantity}x Partner-Vorlage (${addOnModules})${orderSuffix}`;
}

async function findOrCreateSchoolCustomer(params: {
  email: string;
  name?: string;
  address?: Stripe.AddressParam;
}) {
  const listed = await stripeClient.customers.list({
    email: params.email,
    limit: 1,
  });
  const existing = listed.data[0];

  if (existing) {
    return stripeClient.customers.update(existing.id, {
      name: params.name,
      email: params.email,
      address: params.address,
      preferred_locales: [STRIPE_GERMAN_LOCALE],
    });
  }

  return stripeClient.customers.create({
    email: params.email,
    name: params.name,
    address: params.address,
    preferred_locales: [STRIPE_GERMAN_LOCALE],
  });
}

export async function createPartnerSchoolInvoice(
  input: PartnerSchoolInvoiceInput,
): Promise<PartnerSchoolInvoiceResult> {
  const school = asRecord(input.schoolSnapshot);
  const schoolEmail = asString(school, "email");
  const schoolName = asString(school, "name");
  const schoolOrg = asString(school, "org");
  const schoolVatId = asString(school, "vatId");
  const schoolAddress = asAddressParam(school.address);
  const schoolCountry = schoolAddress?.country;

  if (!schoolEmail) {
    throw new Error("School email not available for partner school invoice");
  }

  const issuerSnapshot = buildPartnerIssuerSnapshot({
    partnerUserId: input.partnerUserId,
    partnerName: input.partnerName,
    partnerEmail: input.partnerEmail,
    schoolCountry,
    schoolVatId,
  });
  const invoiceCountryPath = issuerSnapshot.invoiceCountryPath;
  const legalText = issuerSnapshot.legalText;

  const schoolCustomer = await findOrCreateSchoolCustomer({
    email: schoolEmail,
    name: schoolOrg ?? schoolName,
    address: schoolAddress,
  });

  const summaryDescription = buildOverviewDescription(
    input.lineItemsSnapshot,
    input.orderKey,
  );
  const workflowRef = input.orderKey ?? input.partnerOrderId;

  await stripeClient.invoiceItems.create(
    {
      customer: schoolCustomer.id,
      currency: "eur",
      amount: 0,
      description: `Partner-Abrechnung (Schule): ${summaryDescription}`,
      metadata: {
        invoiceType: "PARTNER_PROGRAM_SCHOOL_OVERVIEW",
        partnerOrderId: input.partnerOrderId,
        partnerUserId: input.partnerUserId,
        workflowRef,
        invoiceCountryPath,
        vatTreatment: issuerSnapshot.vatTreatment,
        schoolVatId: issuerSnapshot.schoolVatId ?? "",
      },
    },
    {
      idempotencyKey: `partner_school_item_${input.partnerOrderId}`,
    },
  );

  const invoice = await stripeClient.invoices.create(
    {
      customer: schoolCustomer.id,
      auto_advance: true,
      collection_method: "send_invoice",
      days_until_due: 14,
      footer: `${PARTNER_INVOICE_FOOTER}\n${legalText}\nRechnungsaussteller: ${input.partnerName}`,
      custom_fields: [
        ...(issuerSnapshot.schoolVatId
          ? [{ name: "USt-IdNr. Schule", value: issuerSnapshot.schoolVatId }]
          : []),
        { name: "Steuerfall", value: issuerSnapshot.vatTreatment },
      ],
      metadata: {
        invoiceType: "PARTNER_PROGRAM_SCHOOL",
        partnerOrderId: input.partnerOrderId,
        partnerUserId: input.partnerUserId,
        workflowRef,
        invoiceCountryPath,
        vatTreatment: issuerSnapshot.vatTreatment,
        schoolVatId: issuerSnapshot.schoolVatId ?? "",
        eInvoicePath: issuerSnapshot.eInvoiceCompatibilityPath,
      },
    },
    {
      idempotencyKey: `partner_school_invoice_${input.partnerOrderId}`,
    },
  );

  if (!invoice.id) {
    throw new Error("Failed to create partner school invoice");
  }

  const sent = await stripeClient.invoices.sendInvoice(invoice.id);

  return {
    invoiceId: sent.id,
    hostedInvoiceUrl: sent.hosted_invoice_url ?? null,
    issuedAt: new Date().toISOString(),
    issuerSnapshot,
  };
}
