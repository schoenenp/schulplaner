import { describe, expect, it } from "bun:test";
import {
  createPartnerClaimToken,
  getPartnerClaimExpiry,
  hashPartnerClaimToken,
  maskEmail,
} from "./partner-claim";

describe("partner-claim utils", () => {
  it("creates a 64-char hex claim token", () => {
    const token = createPartnerClaimToken();
    expect(token).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(token)).toBeTrue();
  });

  it("hashes token deterministically to sha256 hex", () => {
    const token = "abc123";
    const hashed = hashPartnerClaimToken(token);
    expect(hashed).toBe(
      "6ca13d52ca70c883e0f0bb101e425a89e8624de51db2d2392593af6a84118090",
    );
  });

  it("returns expiry 2 days ahead from source date", () => {
    const fromDate = new Date("2026-03-07T10:00:00.000Z");
    const expiry = getPartnerClaimExpiry(fromDate);
    expect(expiry.toISOString()).toBe("2026-03-09T10:00:00.000Z");
  });

  it("masks email while preserving domain", () => {
    expect(maskEmail("school@example.at")).toBe("sc***l@example.at");
    expect(maskEmail("ab@example.at")).toBe("ab***@example.at");
  });

  it("returns input if not a valid email format", () => {
    expect(maskEmail("not-an-email")).toBe("not-an-email");
  });
});
