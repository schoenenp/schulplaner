import { PrismaAdapter } from "@auth/prisma-adapter";
import type { DefaultSession, NextAuthConfig } from "next-auth";
import NodemailerProvider from "next-auth/providers/nodemailer";
import type { UserRole } from "db";
import { brand } from "@/brand";
import { env } from "@/env";
import { db } from "@/server/db";
import { sendMail, smtpServer, mailFrom } from "@/server/mail";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: { id: string; role: UserRole } & DefaultSession["user"];
  }
  interface User {
    role: UserRole;
  }
}

const verificationLimit = new Map<string, { count: number; resetAt: number }>();
const VERIFICATION_WINDOW_MS = 10 * 60 * 1000;
const VERIFICATION_MAX_REQUESTS = 5;

function enforceVerificationRateLimit(identifier: string) {
  const now = Date.now();
  const key = identifier.toLowerCase();
  const entry = verificationLimit.get(key);
  if (!entry || entry.resetAt <= now) {
    verificationLimit.set(key, { count: 1, resetAt: now + VERIFICATION_WINDOW_MS });
    return;
  }
  if (entry.count >= VERIFICATION_MAX_REQUESTS) {
    throw new Error("Too many sign-in links requested");
  }
  entry.count += 1;
}

export const authConfig = {
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  trustHost: true,
  pages: {
    signIn: "/anmelden",
    verifyRequest: "/anmelden/pruefen",
    error: "/anmelden",
  },
  providers: [
    NodemailerProvider({
      server: smtpServer(),
      from: mailFrom(),
      maxAge: 60 * 60,
      async sendVerificationRequest({ identifier, url }) {
        enforceVerificationRateLimit(identifier);
        // Links always point at the configured origin, never a request host.
        const link = new URL(url);
        const origin = new URL(env.APP_URL);
        link.protocol = origin.protocol;
        link.host = origin.host;
        await sendMail({
          to: identifier,
          subject: `Ihr Anmeldelink für ${brand.name}`,
          text: [
            "Guten Tag,",
            "",
            `mit diesem Link melden Sie sich bei ${brand.name} an:`,
            link.toString(),
            "",
            "Der Link ist 60 Minuten gültig. Falls Sie keine Anmeldung angefordert haben, können Sie diese E-Mail ignorieren.",
          ].join("\n"),
        });
      },
    }),
  ],
  callbacks: {
    session: ({ session, user }) => ({
      ...session,
      user: { ...session.user, id: user.id, role: user.role },
    }),
  },
  events: {
    async signIn({ user }) {
      const admin = env.PANEL_ADMIN_EMAIL?.toLowerCase();
      if (admin && user.id && user.email?.toLowerCase() === admin && user.role !== "ADMIN") {
        await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
      }
    },
  },
} satisfies NextAuthConfig;
