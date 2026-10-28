import { describe, expect, it } from "bun:test";
import {
  assertPricingDatabaseUrl,
  pricingDatabaseUrlSchema,
} from "./connection";

describe("isolated pricing connection", () => {
  it("accepts explicit PostgreSQL databases and preserves SSL parameters", () => {
    const url =
      "postgresql://pricing:secret@pricing-db:5432/pricing?sslmode=require";
    expect(
      pricingDatabaseUrlSchema("postgresql://app:other@app-db/shop").parse(url),
    ).toBe(url);
  });
  it("rejects shared databases despite different credentials or connection options", () => {
    expect(() =>
      assertPricingDatabaseUrl(
        "postgres://pricing:secret@localhost/pricing?sslmode=require",
        "postgresql://app:other@127.0.0.1:5432/pricing",
      ),
    ).toThrow("andere Datenbank");
  });
  it("rejects missing database names and non-PostgreSQL URLs without exposing credentials", () => {
    for (const value of [
      "",
      "mysql://user:private@db/pricing",
      "postgres://user:private@db",
      "postgres://user:private@db/pricing?host=app-db",
    ]) {
      const result = pricingDatabaseUrlSchema().safeParse(value);
      expect(result.success).toBe(false);
      if (!result.success)
        expect(result.error.message).not.toContain("private");
    }
  });
});
