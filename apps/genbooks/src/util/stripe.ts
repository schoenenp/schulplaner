import Stripe from "stripe";
import { env } from "@/env";

// NOTE:
// Use a Stripe Client instance for all Stripe requests.
// Keep API version unset so the SDK default is used automatically.
export const stripeClient = new Stripe(env.STRIPE_SECRET_KEY);

// Backward-compatible alias for existing imports in the app.
export const stripe = stripeClient;

export function toStripeAddress(address: {
  streetNr: string;
  street: string;
  optional?: string;
  state?: string;
  city: string;
  zip: string;
  country?: string;
}) {
  const { city, country, streetNr, street, optional, zip, state } = address
  return {
    city,
    country: country ?? "DE",
    line1: `${streetNr}, ${street}`,
    state,
    line2: `${optional}`,
    postal_code: zip
  }
}
