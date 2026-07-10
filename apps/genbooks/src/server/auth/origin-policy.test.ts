import { describe, expect, it } from "bun:test";

import { getAuthOriginPolicyError } from "./origin-policy";

function headers(host: string) {
  return new Headers({
    host,
    "x-forwarded-proto": "https",
  });
}

describe("auth origin policy", () => {
  it("allows local production start with localhost AUTH_URL", () => {
    expect(
      getAuthOriginPolicyError(headers("localhost:3000"), {
        NODE_ENV: "production",
        AUTH_URL: "http://localhost:3000",
      }),
    ).toBeNull();
  });

  it("rejects external production requests when AUTH_URL is localhost", () => {
    expect(
      getAuthOriginPolicyError(headers("planer.example.de"), {
        NODE_ENV: "production",
        AUTH_URL: "http://localhost:3000",
        APP_ALLOWED_ORIGINS: "https://planer.example.de",
      }),
    ).toContain("points to localhost");
  });

  it("allows configured external production origins", () => {
    expect(
      getAuthOriginPolicyError(headers("planer.example.de"), {
        NODE_ENV: "production",
        AUTH_URL: "https://planer.example.de",
      }),
    ).toBeNull();
  });

  it("rejects unconfigured external production origins", () => {
    expect(
      getAuthOriginPolicyError(headers("evil.example"), {
        NODE_ENV: "production",
        AUTH_URL: "https://planer.example.de",
      }),
    ).toContain("not in the configured production origin allowlist");
  });
});
