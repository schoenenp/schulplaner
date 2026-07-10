import { describe, expect, it } from "bun:test";
import {
  buildPartnerOrderPayloadHash,
  buildReleaseDispatchKey,
  canTransitionPartnerOrderStatus,
} from "./transitions";

describe("partner transitions", () => {
  it("validates allowed status transitions", () => {
    expect(
      canTransitionPartnerOrderStatus(
        "UNDER_PARTNER_REVIEW",
        "PARTNER_CONFIRMED",
      ),
    ).toBeTrue();
    expect(
      canTransitionPartnerOrderStatus("PARTNER_DECLINED", "PARTNER_CONFIRMED"),
    ).toBeFalse();
  });

  it("builds stable payload hash", () => {
    const payload = { orderId: 1, foo: "bar" };
    const first = buildPartnerOrderPayloadHash(payload);
    const second = buildPartnerOrderPayloadHash(payload);
    expect(first).toBe(second);
    expect(first.length).toBe(64);
  });

  it("builds deterministic release dispatch key", () => {
    const key = buildReleaseDispatchKey("po_1", new Date("2026-03-07T10:00:00.000Z"));
    expect(key).toBe("partner_release_po_1_1772877600000");
  });
});
