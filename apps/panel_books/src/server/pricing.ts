import path from "node:path";
import { openPriceStore, type PriceStore } from "pricing/store";

import { env } from "@/env";
import { logger } from "@/server/util/logger";

const globalForPricing = globalThis as unknown as { priceStore?: PriceStore };

function resolvePriceDbPath(): string {
  if (env.PRICING_DB_PATH) return env.PRICING_DB_PATH;
  if (env.NODE_ENV === "production") {
    throw new Error(
      "PRICING_DB_PATH fehlt. Die Preisdatenbank braucht einen dauerhaften Speicherort.",
    );
  }
  return path.join(process.cwd(), ".data", "pricing.sqlite");
}

/** The panel-owned price book store (SQLite, separate from DATABASE_URL). */
export function getPriceStore(): PriceStore {
  if (globalForPricing.priceStore) return globalForPricing.priceStore;

  const dbPath = resolvePriceDbPath();
  const store = openPriceStore(dbPath);
  if (store.initialized) {
    // Expected once. After a redeploy it means the volume is not mounted and
    // the shop now charges the seeded defaults.
    logger.warn("pricing_db_initialized_with_defaults", { path: dbPath });
  }
  globalForPricing.priceStore = store;
  return store;
}
