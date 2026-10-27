import { TRPCError } from "@trpc/server";
import {
  DEFAULT_PRICE_BOOK,
  priceBookPayloadSchema,
  type PriceBookPayload,
} from "pricing";

import { env } from "@/env";
import { logger } from "@/util/logger";

// Admins manage prices in the panel, which owns the price database and serves
// it from /api/pricing. The shop keeps the last good copy so a panel restart
// does not stop sales, but never invents prices it has not loaded.
const FRESH_FOR_MS = 30_000;
const RETRY_AFTER_FAILURE_MS = 10_000;
const FETCH_TIMEOUT_MS = 3_000;

const UNAVAILABLE_MESSAGE =
  "Die Preise können gerade nicht geladen werden. Bitte versuchen Sie es in einer Minute erneut.";

/** Outside production without a configured panel. Version 0 marks it. */
export const DEFAULT_PRICE_BOOK_PAYLOAD: PriceBookPayload = {
  version: 0,
  updatedAt: "1970-01-01T00:00:00.000Z",
  priceBook: DEFAULT_PRICE_BOOK,
};

export function createPriceBookSource({
  url,
  token,
  isProduction,
  fetchImpl = fetch,
  now = Date.now,
}: {
  url?: string;
  token?: string;
  isProduction: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
}) {
  let cached: { payload: PriceBookPayload; freshUntil: number } | undefined;
  let inflight: Promise<PriceBookPayload> | undefined;
  let warnedAboutDefaults = false;

  async function load(source: string, secret: string) {
    try {
      const response = await fetchImpl(source, {
        headers: { authorization: `Bearer ${secret}`, accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`Pricing API responded with ${response.status}`);
      }
      const payload = priceBookPayloadSchema.parse(await response.json());
      if (cached && cached.payload.version !== payload.version) {
        logger.info("price_book_updated", {
          from: cached.payload.version,
          to: payload.version,
        });
      }
      cached = { payload, freshUntil: now() + FRESH_FOR_MS };
      return payload;
    } catch (error) {
      if (cached) {
        logger.warn("price_book_refresh_failed_using_last_known", {
          version: cached.payload.version,
          error,
        });
        cached.freshUntil = now() + RETRY_AFTER_FAILURE_MS;
        return cached.payload;
      }
      logger.error("price_book_unavailable", { error });
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: UNAVAILABLE_MESSAGE });
    }
  }

  return async function getPriceBook(): Promise<PriceBookPayload> {
    if (!url || !token) {
      if (isProduction) {
        logger.error("price_book_not_configured");
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: UNAVAILABLE_MESSAGE });
      }
      if (!warnedAboutDefaults) {
        logger.warn("price_book_using_defaults", {
          reason: "PRICING_SOURCE_URL or PRICING_API_TOKEN is not set",
        });
        warnedAboutDefaults = true;
      }
      return DEFAULT_PRICE_BOOK_PAYLOAD;
    }
    if (cached && now() < cached.freshUntil) return cached.payload;
    inflight ??= load(url, token).finally(() => {
      inflight = undefined;
    });
    return inflight;
  };
}

/** The current price book. Every quote in one request should use one call. */
export const getPriceBook = createPriceBookSource({
  url: env.PRICING_SOURCE_URL,
  token: env.PRICING_API_TOKEN,
  isProduction: env.NODE_ENV === "production",
});
