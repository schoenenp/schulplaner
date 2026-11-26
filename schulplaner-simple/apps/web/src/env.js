import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const optional = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string().min(16)
        : z.string().optional(),
    /** Canonical origin used in emails, e.g. https://planer.example.de */
    APP_URL: z.string().url().default("http://localhost:3300"),

    EMAIL_SERVER_HOST: optional,
    EMAIL_SERVER_PORT: z.coerce.number().int().positive().default(465),
    EMAIL_SERVER_USER: optional,
    EMAIL_SERVER_PASSWORD: optional,
    EMAIL_FROM: optional,
    /** Outside production, mails are only logged unless this is "true". */
    EMAIL_DEV_SEND: z.enum(["true", "false"]).default("false"),
    /** Staff inbox that receives a notice for every new order. */
    ORDER_NOTIFY_EMAIL: optional.pipe(z.string().email().optional()),
    /** Verified owner email that is promoted to ADMIN on sign-in. */
    PANEL_ADMIN_EMAIL: optional.pipe(z.string().email().optional()),

    STORAGE_DRIVER: z.enum(["s3", "local", "volume"]).default("s3"),

    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    APP_URL: process.env.APP_URL,
    EMAIL_SERVER_HOST: process.env.EMAIL_SERVER_HOST,
    EMAIL_SERVER_PORT: process.env.EMAIL_SERVER_PORT,
    EMAIL_SERVER_USER: process.env.EMAIL_SERVER_USER,
    EMAIL_SERVER_PASSWORD: process.env.EMAIL_SERVER_PASSWORD,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_DEV_SEND: process.env.EMAIL_DEV_SEND,
    ORDER_NOTIFY_EMAIL: process.env.ORDER_NOTIFY_EMAIL,
    PANEL_ADMIN_EMAIL: process.env.PANEL_ADMIN_EMAIL,
    STORAGE_DRIVER: process.env.STORAGE_DRIVER,
    NODE_ENV: process.env.NODE_ENV,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
