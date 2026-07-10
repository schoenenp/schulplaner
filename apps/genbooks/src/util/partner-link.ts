import crypto from "node:crypto";
import { env } from "@/env";

type TokenClaimsBase = {
  exp: number;
  kind: "campaign_link" | "partnered_checkout";
};

export type PartnerCampaignLinkClaims = TokenClaimsBase & {
  kind: "campaign_link";
  partnerUserId: string;
  templateId: string;
  snapshotBookId: string;
  promotionCodeId: string;
};

export type PartnerCheckoutClaims = TokenClaimsBase & {
  kind: "partnered_checkout";
  partnerUserId: string;
  templateId: string;
  snapshotBookId: string;
  promotionCodeId: string;
  promotionCode: string;
};

type TokenClaims = PartnerCampaignLinkClaims | PartnerCheckoutClaims;

const DEFAULT_LINK_TTL_SECONDS = 365 * 24 * 60 * 60;

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + "=".repeat(paddingLength), "base64");
}

function getTokenSecret(): string {
  return (
    env.PARTNER_LINK_SECRET ??
    env.AUTH_SECRET ??
    env.CANCEL_SECRET
  );
}

function signRawPayload(payloadB64: string): string {
  return base64UrlEncode(
    crypto.createHmac("sha256", getTokenSecret()).update(payloadB64).digest(),
  );
}

export function createPartnerCampaignLinkToken(
  claims: Omit<PartnerCampaignLinkClaims, "kind" | "exp"> & { exp?: number },
): string {
  const exp =
    claims.exp ?? Math.floor(Date.now() / 1000) + DEFAULT_LINK_TTL_SECONDS;

  const payload = {
    kind: "campaign_link",
    partnerUserId: claims.partnerUserId,
    templateId: claims.templateId,
    snapshotBookId: claims.snapshotBookId,
    promotionCodeId: claims.promotionCodeId,
    exp,
  } satisfies PartnerCampaignLinkClaims;

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = signRawPayload(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function createPartnerCheckoutToken(
  claims: Omit<PartnerCheckoutClaims, "kind" | "exp"> & { exp?: number },
): string {
  const exp =
    claims.exp ?? Math.floor(Date.now() / 1000) + DEFAULT_LINK_TTL_SECONDS;

  const payload = {
    kind: "partnered_checkout",
    partnerUserId: claims.partnerUserId,
    templateId: claims.templateId,
    snapshotBookId: claims.snapshotBookId,
    promotionCodeId: claims.promotionCodeId,
    promotionCode: claims.promotionCode,
    exp,
  } satisfies PartnerCheckoutClaims;

  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = signRawPayload(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function verifyPartnerToken(token: string): TokenClaims {
  const [payloadB64, providedSignature] = token.split(".");
  if (!payloadB64 || !providedSignature) {
    throw new Error("Invalid partner token format");
  }

  const expectedSignature = signRawPayload(payloadB64);
  if (providedSignature.length !== expectedSignature.length) {
    throw new Error("Invalid partner token signature");
  }
  if (
    !crypto.timingSafeEqual(
      Buffer.from(providedSignature),
      Buffer.from(expectedSignature),
    )
  ) {
    throw new Error("Invalid partner token signature");
  }

  const payload = JSON.parse(
    base64UrlDecode(payloadB64).toString("utf-8"),
  ) as Record<string, unknown>;

  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  if (!exp || exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Partner token has expired");
  }

  const rawKind = payload.kind;
  const normalizedKind = rawKind;
  if (
    normalizedKind !== "campaign_link" &&
    normalizedKind !== "partnered_checkout"
  ) {
    throw new Error("Unknown partner token type");
  }

  const partnerUserId =
    typeof payload.partnerUserId === "string" ? payload.partnerUserId : null;
  if (!partnerUserId) {
    throw new Error("Partner token missing partner user id");
  }

  const templateId =
    typeof payload.templateId === "string" ? payload.templateId : "";
  const snapshotBookId =
    typeof payload.snapshotBookId === "string" ? payload.snapshotBookId : "";
  const promotionCodeId =
    typeof payload.promotionCodeId === "string" ? payload.promotionCodeId : "";

  if (normalizedKind === "campaign_link") {
    return {
      kind: "campaign_link",
      partnerUserId,
      templateId,
      snapshotBookId,
      promotionCodeId,
      exp,
    };
  }

  const promotionCode =
    typeof payload.promotionCode === "string" ? payload.promotionCode : "";

  return {
    kind: "partnered_checkout",
    partnerUserId,
    templateId,
    snapshotBookId,
    promotionCodeId,
    promotionCode,
    exp,
  };
}
