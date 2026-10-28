import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { DEFAULT_PRICE_BOOK } from "pricing";

const TOKEN = "pricing-test-token-0123456789abcdef";
let configuredToken: string | undefined;
const current = mock(async () => ({
  id: 2,
  createdAt: "2026-10-28T12:00:00.000Z",
  priceBook: { ...DEFAULT_PRICE_BOOK, minimumUnitCents: 250 },
}));
const getStore = mock(async () => ({ current }));
mock.module("@/env", () => ({
  env: {
    get PRICING_API_TOKEN() {
      return configuredToken;
    },
  },
}));
mock.module("@/server/pricing", () => ({ getPriceStore: getStore }));
const { GET } = await import("./route");
function request(authorization?: string) {
  return new Request("https://panel.example.test/api/pricing", {
    headers: authorization ? { authorization } : undefined,
  });
}
beforeEach(() => {
  configuredToken = TOKEN;
  getStore.mockClear();
  current.mockClear();
});
afterAll(() => mock.restore());

describe("GET /api/pricing", () => {
  it("awaits PostgreSQL and serves the price book to the shop", async () => {
    const response = await GET(request(`Bearer ${TOKEN}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      version: 2,
      priceBook: { minimumUnitCents: 250 },
    });
  });
  it("rejects missing or wrong tokens before accessing the database", async () => {
    for (const authorization of [
      undefined,
      TOKEN,
      `Bearer ${TOKEN}x`,
      "Bearer ",
      `Basic ${TOKEN}`,
    ])
      expect((await GET(request(authorization))).status).toBe(401);
    expect(getStore).not.toHaveBeenCalled();
  });
  it("is unavailable until a token is configured", async () => {
    configuredToken = undefined;
    expect((await GET(request(`Bearer ${TOKEN}`))).status).toBe(503);
    expect(getStore).not.toHaveBeenCalled();
  });
  it("catches asynchronous database failures without leaking connection details", async () => {
    current.mockRejectedValueOnce(new Error("private connection details"));
    const response = await GET(request(`Bearer ${TOKEN}`));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private connection details");
  });
});
