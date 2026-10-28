import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { PriceStore } from "pricing/store";

const store = { initialized: false } as PriceStore;
const open = mock(async () => store);
let url: string | undefined;
mock.module("pricing/store", () => ({ openPriceStore: open }));
mock.module("@/env", () => ({
  env: {
    DATABASE_URL: "postgresql://app@localhost/shop",
    get PRICING_DATABASE_URL() {
      return url;
    },
  },
}));
const { getPriceStore } = await import("./pricing");
beforeEach(() => {
  (globalThis as unknown as { priceStore?: unknown }).priceStore = undefined;
  url = "postgresql://pricing@localhost/pricing";
  open.mockReset().mockImplementation(async () => store);
});
describe("panel PostgreSQL connection lifecycle", () => {
  it("shares one initialization between concurrent callers", async () => {
    expect(await Promise.all([getPriceStore(), getPriceStore()])).toEqual([
      store,
      store,
    ]);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        applicationDatabaseUrl: "postgresql://app@localhost/shop",
      }),
    );
  });
  it("retries after a failed connection instead of retaining a rejected promise", async () => {
    open.mockRejectedValueOnce(new Error("temporary outage"));
    await expect(getPriceStore()).rejects.toThrow("temporary outage");
    expect(await getPriceStore()).toBe(store);
    expect(open).toHaveBeenCalledTimes(2);
  });
  it("never uses the application database when the pricing URL is missing", async () => {
    url = undefined;
    await expect(getPriceStore()).rejects.toThrow("PRICING_DATABASE_URL fehlt");
    expect(open).not.toHaveBeenCalled();
  });
});
