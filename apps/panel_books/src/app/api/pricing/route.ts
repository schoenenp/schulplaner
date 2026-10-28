import { createHash, timingSafeEqual } from "node:crypto";
import type { PriceBookPayload } from "pricing";

import { env } from "@/env";
import { getPriceStore } from "@/server/pricing";
import { logger } from "@/server/util/logger";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function hasValidToken(authorization: string | null, expected: string) {
  const provided = /^Bearer (.+)$/.exec(authorization ?? "")?.[1] ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(provided), digest(expected));
}

// The shop (genbooks) reads the current price book here with the shared
// PRICING_API_TOKEN. Uses only PRICING_DATABASE_URL, never DATABASE_URL.
export async function GET(request: Request) {
  const expected = env.PRICING_API_TOKEN;
  if (!expected) {
    return Response.json(
      { error: "Pricing API is not configured" },
      { status: 503, headers: NO_STORE },
    );
  }
  if (!hasValidToken(request.headers.get("authorization"), expected)) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    const store = await getPriceStore();
    const current = await store.current();
    const payload: PriceBookPayload = {
      version: current.id,
      updatedAt: current.createdAt,
      priceBook: current.priceBook,
    };
    return Response.json(payload, { headers: NO_STORE });
  } catch (error) {
    logger.error("pricing_api_failed", { error });
    return Response.json(
      { error: "Price book unavailable" },
      { status: 500, headers: NO_STORE },
    );
  }
}
