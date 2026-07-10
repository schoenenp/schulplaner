import { describe, expect, it } from "bun:test";
import { canAccessBookForSetupOrder } from "./setup-order-access";

describe("canAccessBookForSetupOrder", () => {
  it("allows guest checkout for unowned books", () => {
    expect(
      canAccessBookForSetupOrder({
        bookOwnerId: null,
      }),
    ).toBeTrue();
  });

  it("allows owner access", () => {
    expect(
      canAccessBookForSetupOrder({
        bookOwnerId: "user_1",
        sessionUserId: "user_1",
      }),
    ).toBeTrue();
  });

  it("denies access for different user", () => {
    expect(
      canAccessBookForSetupOrder({
        bookOwnerId: "user_1",
        sessionUserId: "user_2",
      }),
    ).toBeFalse();
  });

  it("allows template-share planners only for the owning user", () => {
    expect(
      canAccessBookForSetupOrder({
        bookOwnerId: "user_1",
        sessionUserId: "user_1",
        bookSourceType: "TEMPLATE_SHARE",
      }),
    ).toBeTrue();

    expect(
      canAccessBookForSetupOrder({
        bookOwnerId: "user_1",
        sessionUserId: "user_2",
        bookSourceType: "TEMPLATE_SHARE",
      }),
    ).toBeFalse();

    expect(
      canAccessBookForSetupOrder({
        bookOwnerId: null,
        sessionUserId: "user_1",
        bookSourceType: "TEMPLATE_SHARE",
      }),
    ).toBeFalse();
  });

  it("denies guest access for owned books", () => {
    expect(
      canAccessBookForSetupOrder({
        bookOwnerId: "user_1",
      }),
    ).toBeFalse();
  });

  it("allows partner template access only for claim owner", () => {
    expect(
      canAccessBookForSetupOrder({
        bookOwnerId: "user_1",
        sessionUserId: "user_1",
        bookSourceType: "PARTNER_TEMPLATE",
        partnerClaimUserId: "user_1",
      }),
    ).toBeTrue();
  });

  it("denies partner template access for guests", () => {
    expect(
      canAccessBookForSetupOrder({
        bookOwnerId: "user_1",
        bookSourceType: "PARTNER_TEMPLATE",
        partnerClaimUserId: "user_1",
      }),
    ).toBeFalse();
  });

  it("denies partner template access when claim belongs to another user", () => {
    expect(
      canAccessBookForSetupOrder({
        bookOwnerId: "user_2",
        sessionUserId: "user_1",
        bookSourceType: "PARTNER_TEMPLATE",
        partnerClaimUserId: "user_2",
      }),
    ).toBeFalse();
  });

  it("denies partner template access when claim owner is missing", () => {
    expect(
      canAccessBookForSetupOrder({
        bookOwnerId: "user_1",
        sessionUserId: "user_1",
        bookSourceType: "PARTNER_TEMPLATE",
        partnerClaimUserId: null,
      }),
    ).toBeFalse();
  });
});
