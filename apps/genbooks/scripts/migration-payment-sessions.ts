import Stripe from "stripe";
import type { Checkout } from "../../../scripts/db-migration/payment-plan";

export async function inventoryCheckoutSessions(secret: string, recordedIds: string[], bookOrderIds: Set<string>): Promise<Checkout[]> {
  const stripe = new Stripe(secret, { maxNetworkRetries: 2 });
  const sessions = new Map<string, Checkout>();
  // No creation-time filter: old checkouts can finish during maintenance.
  for await (const session of stripe.checkout.sessions.list({ limit: 100 })) {
    if (session.metadata?.orderId && bookOrderIds.has(session.metadata.orderId)) sessions.set(session.id, session);
  }
  for (const id of new Set(recordedIds)) {
    if (!sessions.has(id)) sessions.set(id, await stripe.checkout.sessions.retrieve(id));
  }
  return [...sessions.values()];
}
