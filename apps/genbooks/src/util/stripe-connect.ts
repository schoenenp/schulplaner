import { stripeClient } from "@/util/stripe";

type V2CoreClient = {
  accounts: {
    create: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
    update: (
      accountId: string,
      params: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    retrieve: (
      accountId: string,
      params?: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
  };
  accountLinks: {
    create: (params: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  events: {
    retrieve: (eventId: string) => Promise<Record<string, unknown>>;
  };
};

/**
 * Returns the V2 Core Stripe client namespace.
 * Throws a clear error when the installed Stripe SDK doesn't include the V2 Account APIs.
 */
export function getStripeV2CoreClient(): V2CoreClient {
  const v2Core = (stripeClient as unknown as { v2?: { core?: unknown } }).v2
    ?.core as Partial<V2CoreClient> | undefined;

  if (!v2Core?.accounts || !v2Core?.accountLinks || !v2Core?.events) {
    throw new Error(
      "Stripe V2 Core APIs are unavailable. Upgrade the Stripe SDK to a version that supports v2.core.accounts and v2.core.accountLinks.",
    );
  }

  return v2Core as V2CoreClient;
}
