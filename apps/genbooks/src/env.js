import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    STRIPE_SECRET_KEY: z.string(),
    STRIPE_CONNECT_SUBSCRIPTION_MONTHLY_PRICE_ID: z.string().optional(),
    STRIPE_CONNECT_SUBSCRIPTION_YEARLY_PRICE_ID: z.string().optional(),
    STRIPE_CONNECT_APPLICATION_FEE_CENTS: z.string().optional(),
    STRIPE_CONNECT_COUNTRY: z.string().optional(),
    PARTNER_CONTROLLED_FULFILLMENT_ENABLED: z.string().optional(),
    PARTNER_SETTLEMENT_ENABLED: z.string().optional(),
    PARTNER_EU_LEGAL_TEXT: z.string().optional(),
    APP_ALLOWED_ORIGINS: z.string().optional(),
    APP_FALLBACK_ORIGIN: z.string().optional(),
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    EMAIL_SERVER_USER: z.string(),
    AUTH_URL: z.string().optional(),
    // AUTH_LINKEDIN_ID:z.string(),
    // AUTH_LINKEDIN_SECRET:z.string(),
    AUTH_GOOGLE_ID: z.string(),
    AUTH_GOOGLE_SECRET: z.string(),
    STRIPE_SUCCESS_URL: z.string().url(),
    STRIPE_CANCEL_URL: z.string().url(),
    PARTNER_LINK_SECRET: z.string().optional(),
    EMAIL_SERVER_PASSWORD: z.string(),
    EMAIL_SERVER_HOST: z.string(),
    EMAIL_SERVER_PORT: z.coerce.number().int().positive().default(465),
    EMAIL_FROM: z.string(),
    SHOP_EMAIL: z.string(),
    CANCEL_SECRET: z.string(),
    UPLOAD_URL_LINK: z.string(),
    UPLOAD_API_KEY: z.string(),
    CUSTOM_COVER_TEMPLATE_URL: z.string().optional(),
    GHOST_GRAYSCALE_API_KEY: z.string().optional(),
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_CDN_SERVER_URL: z.string(),
    NEXT_PUBLIC_STRIPE_PUSHABLE_KEY: z.string(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),

  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    NEXT_PUBLIC_STRIPE_PUSHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUSHABLE_KEY,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_CONNECT_SUBSCRIPTION_MONTHLY_PRICE_ID:
      process.env.STRIPE_CONNECT_SUBSCRIPTION_MONTHLY_PRICE_ID,
    STRIPE_CONNECT_SUBSCRIPTION_YEARLY_PRICE_ID:
      process.env.STRIPE_CONNECT_SUBSCRIPTION_YEARLY_PRICE_ID,
    STRIPE_CONNECT_APPLICATION_FEE_CENTS:
      process.env.STRIPE_CONNECT_APPLICATION_FEE_CENTS,
    STRIPE_CONNECT_COUNTRY: process.env.STRIPE_CONNECT_COUNTRY,
    PARTNER_CONTROLLED_FULFILLMENT_ENABLED:
      process.env.PARTNER_CONTROLLED_FULFILLMENT_ENABLED,
    PARTNER_SETTLEMENT_ENABLED: process.env.PARTNER_SETTLEMENT_ENABLED,
    PARTNER_EU_LEGAL_TEXT: process.env.PARTNER_EU_LEGAL_TEXT,
    APP_ALLOWED_ORIGINS: process.env.APP_ALLOWED_ORIGINS,
    APP_FALLBACK_ORIGIN: process.env.APP_FALLBACK_ORIGIN,
    AUTH_SECRET: process.env.AUTH_SECRET,
    EMAIL_SERVER_USER: process.env.EMAIL_SERVER_USER,
    NEXT_PUBLIC_CDN_SERVER_URL: process.env.NEXT_PUBLIC_CDN_SERVER_URL,

    EMAIL_SERVER_PASSWORD: process.env.EMAIL_SERVER_PASSWORD,
    EMAIL_SERVER_HOST: process.env.EMAIL_SERVER_HOST,
    EMAIL_SERVER_PORT: process.env.EMAIL_SERVER_PORT,
    UPLOAD_URL_LINK: process.env.UPLOAD_URL_LINK,
    UPLOAD_API_KEY: process.env.UPLOAD_API_KEY,
    CUSTOM_COVER_TEMPLATE_URL: process.env.CUSTOM_COVER_TEMPLATE_URL,
    GHOST_GRAYSCALE_API_KEY: process.env.GHOST_GRAYSCALE_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    AUTH_URL: process.env.AUTH_URL,
    // AUTH_LINKEDIN_ID: process.env.AUTH_LINKEDIN_ID,
    // AUTH_LINKEDIN_SECRET: process.env.AUTH_LINKEDIN_SECRET,
    SHOP_EMAIL: process.env.SHOP_EMAIL,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    CANCEL_SECRET: process.env.CANCEL_SECRET,
    STRIPE_SUCCESS_URL: process.env.STRIPE_SUCCESS_URL,
    STRIPE_CANCEL_URL: process.env.STRIPE_CANCEL_URL,
    PARTNER_LINK_SECRET: process.env.PARTNER_LINK_SECRET,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
