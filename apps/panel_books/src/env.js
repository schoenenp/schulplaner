import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    EMAIL_SERVER_USER: z.string(),
    EMAIL_SERVER_PASSWORD: z.string(),
    EMAIL_SERVER_HOST: z.string(),
    EMAIL_SERVER_PORT: z.coerce.number().int().positive().default(465),
    EMAIL_SERVER_SECURE: z.enum(["true", "false"]).optional(),
    EMAIL_SERVER_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    EMAIL_FROM: z.string(),
    UPLOAD_URL_LINK: z.string(),
    UPLOAD_API_KEY: z.string(),
    CUSTOM_COVER_TEMPLATE_URL: z.string().optional(),
    STRIPE_SECRET_KEY: z.string(),
    PARTNER_CONTROLLED_FULFILLMENT_ENABLED: z.string().optional(),
    PARTNER_EU_LEGAL_TEXT: z.string().optional(),
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
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    EMAIL_SERVER_USER: process.env.EMAIL_SERVER_USER,
    EMAIL_SERVER_PASSWORD: process.env.EMAIL_SERVER_PASSWORD,
    EMAIL_SERVER_HOST: process.env.EMAIL_SERVER_HOST,
    EMAIL_SERVER_PORT: process.env.EMAIL_SERVER_PORT,
    EMAIL_SERVER_SECURE: process.env.EMAIL_SERVER_SECURE,
    EMAIL_SERVER_TIMEOUT_MS: process.env.EMAIL_SERVER_TIMEOUT_MS,
    EMAIL_FROM: process.env.EMAIL_FROM,
    DATABASE_URL: process.env.DATABASE_URL,
    UPLOAD_URL_LINK: process.env.UPLOAD_URL_LINK,
    UPLOAD_API_KEY: process.env.UPLOAD_API_KEY,
    CUSTOM_COVER_TEMPLATE_URL: process.env.CUSTOM_COVER_TEMPLATE_URL,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    PARTNER_CONTROLLED_FULFILLMENT_ENABLED:
      process.env.PARTNER_CONTROLLED_FULFILLMENT_ENABLED,
    PARTNER_EU_LEGAL_TEXT: process.env.PARTNER_EU_LEGAL_TEXT,
    GHOST_GRAYSCALE_API_KEY: process.env.GHOST_GRAYSCALE_API_KEY,
    NEXT_PUBLIC_CDN_SERVER_URL: process.env.NEXT_PUBLIC_CDN_SERVER_URL,
    NODE_ENV: process.env.NODE_ENV,
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
