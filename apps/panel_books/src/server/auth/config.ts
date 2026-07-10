import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import Nodemailer from "next-auth/providers/nodemailer";
import type { Provider } from "next-auth/providers";
import { env } from "@/env";
import { db } from "@/server/db";
import { logger } from "@/server/util/logger";
import type { UserRole } from "@prisma/client";

const PANEL_ROLES = new Set<UserRole>(["ADMIN", "STAFF", "MODERATOR"]);
const smtpSecure =
  env.EMAIL_SERVER_SECURE === "true" ||
  (!env.EMAIL_SERVER_SECURE && env.EMAIL_SERVER_PORT === 465);

function isPirrotEmail(email: string): boolean {
  return email.toLowerCase().endsWith("@pirrot.de");
}

async function canRequestPanelSignIn(email: string): Promise<boolean> {
  if (isPirrotEmail(email)) {
    return true;
  }

  const existingUser = await db.user.findUnique({
    where: {
      email: email.toLowerCase(),
    },
    select: {
      role: true,
    },
  });

  return existingUser ? PANEL_ROLES.has(existingUser.role) : false;
}
/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role: UserRole;
      // ...other properties
    } & DefaultSession["user"];
  }

  // interface User {
  //   // ...other properties
  //   // role: UserRole;
  // }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */

const providers: Provider[] = [
  Nodemailer({
    server: {
      host: env.EMAIL_SERVER_HOST,
      port: env.EMAIL_SERVER_PORT,
      secure: smtpSecure,
      auth: {
        user: env.EMAIL_SERVER_USER,
        pass: env.EMAIL_SERVER_PASSWORD,
      },
      connectionTimeout: env.EMAIL_SERVER_TIMEOUT_MS,
      greetingTimeout: env.EMAIL_SERVER_TIMEOUT_MS,
      socketTimeout: env.EMAIL_SERVER_TIMEOUT_MS,
    },
    from: env.EMAIL_FROM,
  }),
  /**
   * ...add more providers here.
   *
   * Most other providers require a bit more work than the Discord provider. For example, the
   * GitHub provider requires you to add the `refresh_token_expires_in` field to the Account
   * model. Refer to the NextAuth.js docs for the provider you want to use. Example:
   *
   * @see https://next-auth.js.org/providers/github
   */
];

export const providerMap = providers
  .map((provider) => {
    if (typeof provider === "function") {
      const providerData = provider();
      return { id: providerData.id, name: providerData.name };
    } else {
      return { id: provider.id, name: provider.name };
    }
  })
  .filter((provider) => provider.id !== "credentials");

export const authConfig = {
  providers,
  trustHost: true,
  adapter: PrismaAdapter(db),
  logger: {
    error(code, ...message) {
      logger.error("auth_error", { code, message });
    },
    warn(code, ...message) {
      logger.warn("auth_warning", { code, message });
    },
    debug(code, ...message) {
      logger.debug("auth_debug", { code, message });
    },
  },
  callbacks: {
    session: ({ session, user }) => {
      const role = (user as { role?: UserRole }).role ?? "USER";

      return {
        ...session,
        user: {
          ...session.user,
          id: user.id,
          role,
        },
      };
    },
    signIn: async ({ user }) => {
      if (!user.email) {
        return false;
      }

      return canRequestPanelSignIn(user.email);
    },
  },
} satisfies NextAuthConfig;
