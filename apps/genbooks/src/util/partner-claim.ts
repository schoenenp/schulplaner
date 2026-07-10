import crypto from "crypto";

const PARTNER_CLAIM_TOKEN_BYTES = 32;

export function createPartnerClaimToken(): string {
  return crypto.randomBytes(PARTNER_CLAIM_TOKEN_BYTES).toString("hex");
}

export function hashPartnerClaimToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getPartnerClaimExpiry(fromDate = new Date()): Date {
  const expiresAt = new Date(fromDate);
  expiresAt.setDate(expiresAt.getDate() + 2);
  return expiresAt;
}

export function maskEmail(email: string): string {
  const [localPart, domainPart] = email.split("@");
  if (!localPart || !domainPart) {
    return email;
  }

  const start = localPart.slice(0, 2);
  const end = localPart.length > 4 ? localPart.slice(-1) : "";
  return `${start}***${end}@${domainPart}`;
}
