import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { DEFAULT_PRICE_BOOK } from "pricing";
import { createPriceStore, openSqliteDatabase, type PriceStore } from "pricing/store";

const TOKEN = "pricing-test-token-0123456789abcdef";
let configuredToken: string | undefined;
let store: PriceStore;
let storeError: Error | undefined;

mock.module("@/env", () => ({
  env: {
    get PRICING_API_TOKEN() {
      return configuredToken;
    },
  },
}));
mock.module("@/server/pricing", () => ({
  getPriceStore: () => {
    if (storeError) throw storeError;
    return store;
  },
}));
const { GET } = await import("./route");

function request(authorization?: string) {
  return new Request("https://panel.example.test/api/pricing", {
    headers: authorization ? { authorization } : undefined,
  });
}

beforeEach(() => {
  configuredToken = TOKEN;
  storeError = undefined;
  store = createPriceStore(openSqliteDatabase(":memory:"));
});
afterAll(() => mock.restore());

describe("GET /api/pricing", () => {
  it("serves the current price book to the shop", async () => {
    store.save({
      priceBook: { ...DEFAULT_PRICE_BOOK, minimumUnitCents: 250 },
      baseVersionId: 1,
      actor: { id: "admin", name: "Admin" },
    });
    const response = GET(request(`Bearer ${TOKEN}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as {
      version: number;
      priceBook: { minimumUnitCents: number };
    };
    expect(body.version).toBe(2);
    expect(body.priceBook.minimumUnitCents).toBe(250);
  });

  it("rejects missing or wrong tokens", async () => {
    for (const authorization of [
      undefined,
      TOKEN,
      `Bearer ${TOKEN}x`,
      "Bearer ",
      `Basic ${TOKEN}`,
    ]) {
      expect(GET(request(authorization)).status).toBe(401);
    }
  });

  it("is unavailable until a token is configured", async () => {
    configuredToken = undefined;
    expect(GET(request(`Bearer ${TOKEN}`)).status).toBe(503);
  });

  it("fails without leaking store errors", async () => {
    storeError = new Error("SQLITE_CANTOPEN /data/pricing.sqlite");
    const response = GET(request(`Bearer ${TOKEN}`));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("SQLITE");
  });
});
