import { env } from "@/env";

function parseBool(input: string | undefined): boolean | null {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

export function isPartnerControlledFulfillmentEnabled(): boolean {
  const fromEnv = parseBool(env.PARTNER_CONTROLLED_FULFILLMENT_ENABLED);
  if (fromEnv !== null) return fromEnv;
  return env.NODE_ENV !== "production";
}

export function isPartnerSettlementEnabled(): boolean {
  const fromEnv = parseBool(env.PARTNER_SETTLEMENT_ENABLED);
  if (fromEnv !== null) return fromEnv;
  return false;
}
