import Stripe from "stripe";
import { env } from "@/env";

// Same Stripe account as the genbooks shop. Keep the API version unset so the
// SDK default is used automatically (mirrors genbooks' stripe util).
export const stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
