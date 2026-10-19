import { beforeEach, describe, expect, it, mock } from "bun:test";
import { NextRequest } from "next/server";
import type { Session } from "next-auth";
import { templateSharingFixture } from "@/test/template-sharing";

// Run the real Auth.js handlers, callbacks and PrismaAdapter behind production
// proxy headers. Only SMTP and persistence are replaced; no live emails or DB.
const origin = "https://planer.pirrot.de";
Object.assign(process.env, {
  NODE_ENV: "production",
  AUTH_URL: origin,
  APP_ALLOWED_ORIGINS: origin,
  APP_FALLBACK_ORIGIN: origin,
  AUTH_TRUST_HOST: "true",
});

type TestUser = {
  id: string;
  email: string;
  emailVerified: Date | null;
  role: "USER";
};
type TestSession = { sessionToken: string; userId: string; expires: Date };
type Verification = { identifier: string; token: string; expires: Date };
const users = new Map<string, TestUser>();
const sessions = new Map<string, TestSession>();
const verifications = new Map<string, Verification>();
const emails: Array<{ to: string; text: string }> = [];
const database = {
  user: {
    findUnique: async ({ where }: { where: { id?: string; email?: string } }) =>
      [...users.values()].find((user) =>
        where.id ? user.id === where.id : user.email === where.email,
      ) ?? null,
    create: async ({ data }: { data: Omit<TestUser, "id" | "role"> }) => {
      const user: TestUser = {
        ...data,
        id: `user_${users.size + 1}`,
        role: "USER",
      };
      users.set(user.id, user);
      return user;
    },
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<TestUser>;
    }) => {
      const user = users.get(where.id);
      if (!user) throw new Error("Missing test user");
      Object.assign(user, data);
      return user;
    },
  },
  session: {
    create: async ({ data }: { data: TestSession }) => {
      sessions.set(data.sessionToken, data);
      return data;
    },
    findUnique: async ({ where }: { where: { sessionToken: string } }) => {
      const session = sessions.get(where.sessionToken);
      return session ? { ...session, user: users.get(session.userId) } : null;
    },
  },
  verificationToken: {
    create: async ({ data }: { data: Verification }) => {
      verifications.set(`${data.identifier}:${data.token}`, data);
      return data;
    },
    delete: async ({
      where,
    }: {
      where: { identifier_token: { identifier: string; token: string } };
    }) => {
      const key = `${where.identifier_token.identifier}:${where.identifier_token.token}`;
      const value = verifications.get(key);
      if (!value)
        throw Object.assign(new Error("Consumed verification token"), {
          code: "P2025",
        });
      verifications.delete(key);
      return value;
    },
  },
};
const createTransport = () => ({
  sendMail: async (mail: { to: string; text: string }) => {
    emails.push(mail);
    return { accepted: [mail.to], rejected: [], pending: [] };
  },
});
mock.module("@/server/db", () => ({ db: database }));
mock.module("nodemailer", () => ({
  createTransport,
  default: { createTransport },
}));

const { GET, POST } = await import("@/app/api/auth/[...nextauth]/route");
const { templateSharePath, templateSignInPath, claimedPlannerPath } =
  await import("@/util/template-share-navigation");
const { claimTemplateShareForUser } = await import("@/util/template-share");
const { canAccessBookForSetupOrder } =
  await import("@/server/api/routers/setup-order-access");

function request(
  path: string,
  init: NonNullable<ConstructorParameters<typeof NextRequest>[1]> = {},
) {
  const headers = new Headers(init.headers);
  headers.set("host", "127.0.0.1:3000");
  headers.set("x-forwarded-host", "planer.pirrot.de");
  headers.set("x-forwarded-proto", "https");
  headers.set("x-forwarded-for", "203.0.113.100");
  return new NextRequest(new URL(path, "http://127.0.0.1:3000"), {
    ...init,
    headers,
  });
}

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

describe("emailed template invitation sign-in", () => {
  beforeEach(() => {
    users.clear();
    sessions.clear();
    verifications.clear();
    emails.length = 0;
  });

  it.each([false, true])(
    "preserves the invite through email sign-in (existing account: %s)",
    async (existingAccount) => {
      const email = existingAccount
        ? "existing-school@example.de"
        : "new-school@example.de";
      if (existingAccount)
        users.set("school_existing", {
          id: "school_existing",
          email,
          role: "USER",
          emailVerified: new Date(),
        });
      const f = templateSharingFixture(email);
      const landingPath = templateSharePath(f.token);
      const signInUrl = new URL(templateSignInPath(f.token), origin);
      expect(signInUrl.searchParams.get("callbackUrl")).toBe(landingPath);

      const csrf = await GET(request("/api/auth/csrf"));
      const { csrfToken } = (await csrf.json()) as { csrfToken: string };
      const signIn = await POST(
        request("/api/auth/signin/nodemailer", {
          method: "POST",
          headers: {
            cookie: cookies(csrf),
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            csrfToken,
            email,
            callbackUrl: `${origin}${landingPath}`,
          }),
        }),
      );
      expect(signIn.status).toBe(302);
      expect(signIn.headers.get("location")).toContain(
        `${origin}/api/auth/verify-request`,
      );
      expect(emails).toHaveLength(1);
      expect(emails[0]?.to).toBe(email);
      expect(sessions.size).toBe(0);

      const confirm = new URL(emails[0]!.text.split("\n")[1]!);
      expect(confirm.origin).toBe(origin);
      expect(confirm.pathname).toBe("/auth/confirm");
      const verification = new URL(confirm.searchParams.get("url")!);
      expect(verification.origin).toBe(origin);
      expect(verification.searchParams.get("callbackUrl")).toBe(
        `${origin}${landingPath}`,
      );

      // Like the actual /auth/confirm form, confirm using POST and no cookie jar
      // from the original browser (email links can open in another browser).
      const callback = await POST(
        request(`${verification.pathname}${verification.search}`, {
          method: "POST",
        }),
      );
      expect(callback.status).toBe(302);
      expect(callback.headers.get("location")).toBe(`${origin}${landingPath}`);
      const sessionCookie = callback.headers
        .getSetCookie()
        .find((cookie) => cookie.startsWith("__Secure-authjs.session-token="));
      expect(sessionCookie).toContain("HttpOnly");
      expect(sessionCookie).toContain("Secure");
      expect(users.size).toBe(1);
      expect(sessions.size).toBe(1);
      expect(verifications.size).toBe(0);

      const sessionResponse = await GET(
        request("/api/auth/session", {
          headers: { cookie: cookies(callback) },
        }),
      );
      const session = (await sessionResponse.json()) as Session;
      expect(session.user).toMatchObject({
        email,
        role: "USER",
        id: existingAccount ? "school_existing" : "user_1",
      });
      expect(users.get(session.user.id)?.emailVerified).toBeInstanceOf(Date);

      const claimInput = {
        token: f.token,
        userId: session.user.id,
        userEmail: session.user.email!,
      };
      const claimed = await claimTemplateShareForUser(
        f.db as never,
        claimInput,
      );
      expect(claimedPlannerPath(claimed.bookId)).toBe("/config?bookId=book_1");
      expect(claimed.alreadyClaimed).toBe(false);
      const ownedBook = f.books[0]!;
      expect(
        canAccessBookForSetupOrder({
          bookOwnerId: ownedBook.createdById,
          bookSourceType: ownedBook.sourceType,
          sessionUserId: session.user.id,
        }),
      ).toBe(true);
      expect(
        canAccessBookForSetupOrder({
          bookOwnerId: ownedBook.createdById,
          bookSourceType: ownedBook.sourceType,
          sessionUserId: "someone_else",
        }),
      ).toBe(false);
    },
  );
});
