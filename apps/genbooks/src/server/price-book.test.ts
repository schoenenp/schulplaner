import { describe, expect, it, mock } from "bun:test";
import { DEFAULT_PRICE_BOOK } from "pricing";

import { createPriceBookSource, DEFAULT_PRICE_BOOK_PAYLOAD } from "./price-book";

const URL = "https://panel.example.test/api/pricing";
const TOKEN = "pricing-test-token-0123456789abcdef";

function payload(version: number, minimumUnitCents = 200) {
  return {
    version,
    updatedAt: "2026-10-27T12:00:00.000Z",
    priceBook: { ...DEFAULT_PRICE_BOOK, minimumUnitCents },
  };
}

function setup(responses: Array<Response | Error>) {
  let time = 0;
  const fetchImpl = mock(async (_url: string, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return next;
  });
  const getPriceBook = createPriceBookSource({
    url: URL,
    token: TOKEN,
    isProduction: true,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now: () => time,
  });
  return {
    getPriceBook,
    fetchImpl,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("shop price book source", () => {
  it("loads prices from the panel with the shared token and caches them", async () => {
    const source = setup([Response.json(payload(4, 250))]);
    const first = await source.getPriceBook();
    expect(first.version).toBe(4);
    expect(first.priceBook.minimumUnitCents).toBe(250);

    const [url, init] = source.fetchImpl.mock.calls[0]!;
    expect(url).toBe(URL);
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`);

    source.advance(29_000);
    await source.getPriceBook();
    expect(source.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("picks up new prices after the cache expires", async () => {
    const source = setup([Response.json(payload(4)), Response.json(payload(5, 300))]);
    await source.getPriceBook();
    source.advance(31_000);
    expect((await source.getPriceBook()).priceBook.minimumUnitCents).toBe(300);
  });

  it("shares one request between concurrent callers", async () => {
    const source = setup([Response.json(payload(4))]);
    const results = await Promise.all([
      source.getPriceBook(),
      source.getPriceBook(),
      source.getPriceBook(),
    ]);
    expect(results.map((result) => result.version)).toEqual([4, 4, 4]);
    expect(source.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps the last known prices when the panel is unreachable", async () => {
    const source = setup([
      Response.json(payload(4, 250)),
      new Error("connect ECONNREFUSED"),
      Response.json(payload(5, 300)),
    ]);
    await source.getPriceBook();
    source.advance(31_000);
    expect((await source.getPriceBook()).version).toBe(4);
    // Retries after a short pause instead of on every request.
    source.advance(5_000);
    expect((await source.getPriceBook()).version).toBe(4);
    expect(source.fetchImpl).toHaveBeenCalledTimes(2);
    source.advance(6_000);
    expect((await source.getPriceBook()).version).toBe(5);
  });

  it("refuses to quote before it has ever loaded prices", async () => {
    const source = setup([
      new Error("connect ECONNREFUSED"),
      new Response("nope", { status: 401 }),
      Response.json({ version: 1, updatedAt: "x", priceBook: { sheets: {} } }),
    ]);
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(source.getPriceBook()).rejects.toMatchObject({
        code: "SERVICE_UNAVAILABLE",
      });
    }
  });

  it("uses the built-in prices only outside production without a panel", async () => {
    const development = createPriceBookSource({ isProduction: false });
    expect(await development.call(null)).toEqual(DEFAULT_PRICE_BOOK_PAYLOAD);

    const production = createPriceBookSource({ isProduction: true });
    await expect(production()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});
