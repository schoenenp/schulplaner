import { describe, expect, it } from "bun:test";
import { getClientIp, makeRateLimitKey, takeRateLimitToken } from "./rate-limit";

describe("getClientIp", () => {
  it("uses the first x-forwarded-for address", () => {
    const headers = new Headers();
    headers.set("x-forwarded-for", "203.0.113.10, 10.0.0.2");
    expect(getClientIp(headers)).toBe("203.0.113.10");
  });

  it("falls back to x-real-ip", () => {
    const headers = new Headers();
    headers.set("x-real-ip", "198.51.100.7");
    expect(getClientIp(headers)).toBe("198.51.100.7");
  });
});

describe("makeRateLimitKey", () => {
  it("includes scope, user id and ip", () => {
    const headers = new Headers();
    headers.set("x-forwarded-for", "203.0.113.10");

    const key = makeRateLimitKey(
      {
        headers,
        session: { user: { id: "user_1" } },
      },
      "order.validate",
    );

    expect(key).toBe("order.validate:user_1:203.0.113.10");
  });
});

describe("takeRateLimitToken", () => {
  it("blocks after reaching the max within the window", () => {
    const key = `test_key_${Date.now()}`;
    expect(takeRateLimitToken(key, 2, 10_000).allowed).toBeTrue();
    expect(takeRateLimitToken(key, 2, 10_000).allowed).toBeTrue();
    const blocked = takeRateLimitToken(key, 2, 10_000);
    expect(blocked.allowed).toBeFalse();
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });
});

