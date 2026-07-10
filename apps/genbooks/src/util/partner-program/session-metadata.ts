import type Stripe from "stripe";

export type PartnerSessionMetadata = {
  partnerUserId: string;
  partnerTemplateId: string;
  partnerSnapshotBookId: string;
  partnerPromotionCodeId: string;
  partnerStripeAccountId: string;
  partnerBaseUnitAmount: number;
  partnerBaseTotalAmount: number;
  partnerAddOnUnitAmount: number;
  partnerAddOnTotalAmount: number;
  partnerAddOnModules: string;
};

function toInt(input: string | undefined): number {
  if (!input) return 0;
  const parsed = Number.parseInt(input, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readString(
  metadata: Stripe.Metadata | null | undefined,
  key: string,
): string {
  return metadata?.[key] ?? "";
}

export function parsePartnerSessionMetadata(
  metadata: Stripe.Metadata | null | undefined,
): PartnerSessionMetadata | null {
  const flow = metadata?.partnerFlow;
  if (flow !== "1") {
    return null;
  }

  const partnerUserId = readString(metadata, "partnerUserId");
  const partnerTemplateId = readString(metadata, "partnerTemplateId");
  const partnerSnapshotBookId = readString(metadata, "partnerSnapshotBookId");
  const partnerPromotionCodeId = readString(metadata, "partnerPromotionCodeId");
  const partnerStripeAccountId = readString(metadata, "partnerStripeAccountId");

  if (
    !partnerUserId ||
    !partnerTemplateId ||
    !partnerSnapshotBookId ||
    !partnerPromotionCodeId ||
    !partnerStripeAccountId
  ) {
    return null;
  }

  return {
    partnerUserId,
    partnerTemplateId,
    partnerSnapshotBookId,
    partnerPromotionCodeId,
    partnerStripeAccountId,
    partnerBaseUnitAmount: toInt(metadata?.partnerBaseUnitAmount),
    partnerBaseTotalAmount: toInt(metadata?.partnerBaseTotalAmount),
    partnerAddOnUnitAmount: toInt(metadata?.partnerAddOnUnitAmount),
    partnerAddOnTotalAmount: toInt(metadata?.partnerAddOnTotalAmount),
    partnerAddOnModules: metadata?.partnerAddOnModules ?? "",
  };
}
