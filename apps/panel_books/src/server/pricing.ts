import { openPriceStore, type PriceStore } from "pricing/store";
import { env } from "@/env";
import { logger } from "@/server/util/logger";

const globalForPricing = globalThis as unknown as {
  priceStore?: Promise<PriceStore>;
};

/** Independent PostgreSQL connection; never falls back to the shop database. */
export function getPriceStore(): Promise<PriceStore> {
  if (globalForPricing.priceStore) return globalForPricing.priceStore;
  if (!env.PRICING_DATABASE_URL) {
    return Promise.reject(
      new Error(
        "PRICING_DATABASE_URL fehlt. Bitte eine eigene PostgreSQL-Preisdatenbank konfigurieren.",
      ),
    );
  }
  globalForPricing.priceStore = openPriceStore(env.PRICING_DATABASE_URL, {
    applicationDatabaseUrl: env.DATABASE_URL,
    onError: () => logger.error("pricing_database_connection_error"),
  })
    .then((store) => {
      if (store.initialized) logger.info("pricing_database_initialized");
      return store;
    })
    .catch((error: unknown) => {
      // A temporary outage must not leave a rejected promise cached forever.
      globalForPricing.priceStore = undefined;
      throw error;
    });
  return globalForPricing.priceStore;
}
