import { describe, expect, it } from "bun:test";

import {
  claimTemplateShareForUser,
  createTemplateInviteEmail,
  createTemplateShareToken,
  getTemplateShareExpiry,
  hashTemplateShareToken,
  normalizeTemplateShareEmail,
} from "./template-share";

type TemplateModule = {
  idx: number;
  moduleId: string;
  colorCode: "COLOR" | "GRAYSCALE" | null;
};

type TemplateShareFixture = {
  id: string;
  kind: "LINK" | "INVITE";
  recipientEmail: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  template: {
    id: string;
    name: string | null;
    bookTitle: string | null;
    subTitle: string | null;
    format: string;
    region: string | null;
    planStart: Date;
    planEnd: Date | null;
    country: string;
    isTemplate: boolean;
    deletedAt: Date | null;
    modules: TemplateModule[];
  };
  claims: Array<{
    id: string;
    userId: string;
    book: {
      id: string;
      deletedAt: Date | null;
    } | null;
  }>;
};

function createShareFixture(
  overrides: Partial<TemplateShareFixture> = {},
): TemplateShareFixture {
  return {
    id: "share_1",
    kind: "LINK",
    recipientEmail: null,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    template: {
      id: "template_1",
      name: "Mathe Vorlage",
      bookTitle: "Mathe Planer",
      subTitle: "Klasse 7",
      format: "A4",
      region: "BE",
      planStart: new Date("2026-09-01T00:00:00.000Z"),
      planEnd: new Date("2027-07-31T00:00:00.000Z"),
      country: "DE",
      isTemplate: true,
      deletedAt: null,
      modules: [
        { idx: 0, moduleId: "module_1", colorCode: "COLOR" },
        { idx: 1, moduleId: "module_2", colorCode: "GRAYSCALE" },
      ],
    },
    claims: [],
    ...overrides,
  };
}

function createClaimDb(
  share: TemplateShareFixture,
  options: {
    claimedInviteUserId?: string | null;
    transactionError?: unknown;
    recoveryBookId?: string;
  } = {},
) {
  const calls = {
    bookCreateData: null as unknown,
    claimCreateData: null as unknown,
    claimUpdateData: null as unknown,
  };

  const db = {
    templateShare: {
      findUnique: async () => ({
        template: {
          name: share.template.name,
        },
        claims: options.recoveryBookId
          ? [
              {
                book: {
                  id: options.recoveryBookId,
                  deletedAt: null,
                },
              },
            ]
          : [],
      }),
    },
    $transaction: async (
      callback: (tx: {
        templateShare: {
          findUnique: () => Promise<TemplateShareFixture | null>;
        };
        templateShareClaim: {
          findFirst: () => Promise<{ userId: string } | null>;
          create: (args: unknown) => Promise<{ id: string }>;
          update: (args: unknown) => Promise<{ id: string }>;
        };
        book: {
          create: (args: unknown) => Promise<{ id: string }>;
        };
      }) => Promise<unknown>,
    ) => {
      if (options.transactionError) {
        throw options.transactionError;
      }

      return callback({
        templateShare: {
          findUnique: async () => share,
        },
        templateShareClaim: {
          findFirst: async () =>
            options.claimedInviteUserId
              ? { userId: options.claimedInviteUserId }
              : null,
          create: async (args: unknown) => {
            calls.claimCreateData = args;
            return { id: "claim_1" };
          },
          update: async (args: unknown) => {
            calls.claimUpdateData = args;
            return { id: "claim_1" };
          },
        },
        book: {
          create: async (args: unknown) => {
            calls.bookCreateData = args;
            return { id: "book_new" };
          },
        },
      });
    },
  };

  return { db: db as never, calls };
}

describe("template-share utils", () => {
  it("creates and hashes share tokens", () => {
    const token = createTemplateShareToken();

    expect(token).toHaveLength(64);
    expect(/^[a-f0-9]+$/.test(token)).toBeTrue();
    expect(hashTemplateShareToken("abc123")).toBe(
      "6ca13d52ca70c883e0f0bb101e425a89e8624de51db2d2392593af6a84118090",
    );
  });

  it("normalizes emails and applies default expiries by share kind", () => {
    const fromDate = new Date("2026-06-07T10:00:00.000Z");

    expect(normalizeTemplateShareEmail(" School@Example.DE ")).toBe(
      "school@example.de",
    );
    expect(
      getTemplateShareExpiry("LINK", undefined, fromDate).toISOString(),
    ).toBe("2026-07-07T10:00:00.000Z");
    expect(
      getTemplateShareExpiry("INVITE", undefined, fromDate).toISOString(),
    ).toBe("2026-06-21T10:00:00.000Z");
  });

  it("escapes invite email content", () => {
    const html = createTemplateInviteEmail({
      claimUrl: "https://example.test/claim?token=a&b=<c>",
      templateName: `<Mathe & "Deutsch">`,
      expiresAt: new Date("2026-06-21T10:00:00.000Z"),
    });

    expect(html).toContain("&lt;Mathe &amp; &quot;Deutsch&quot;&gt;");
    expect(html).toContain("a&amp;b=&lt;c&gt;");
    expect(html).not.toContain("<Mathe &");
  });

  it("claims a link by cloning the template as an owned template-share planner", async () => {
    const share = createShareFixture();
    const { db, calls } = createClaimDb(share);

    const result = await claimTemplateShareForUser(db, {
      token: "token_1",
      userId: "user_1",
      userEmail: "User@Example.DE",
    });

    expect(result).toEqual({
      bookId: "book_new",
      alreadyClaimed: false,
      templateName: "Mathe Vorlage",
    });
    expect(calls.bookCreateData).toMatchObject({
      data: {
        bookTitle: "Mathe Planer",
        subTitle: "Klasse 7",
        format: "A4",
        region: "BE",
        country: "DE",
        copyFromId: "template_1",
        createdById: "user_1",
        sourceType: "TEMPLATE_SHARE",
        modules: {
          create: [
            { idx: 0, moduleId: "module_1", colorCode: "COLOR" },
            { idx: 1, moduleId: "module_2", colorCode: "GRAYSCALE" },
          ],
        },
      },
    });
    expect(calls.claimCreateData).toMatchObject({
      data: {
        shareId: "share_1",
        userId: "user_1",
        bookId: "book_new",
        email: "user@example.de",
      },
    });
  });

  it("returns the existing owned book when a share was already claimed", async () => {
    const share = createShareFixture({
      claims: [
        {
          id: "claim_1",
          userId: "user_1",
          book: { id: "book_existing", deletedAt: null },
        },
      ],
    });
    const { db, calls } = createClaimDb(share);

    const result = await claimTemplateShareForUser(db, {
      token: "token_1",
      userId: "user_1",
      userEmail: "user@example.de",
    });

    expect(result).toEqual({
      bookId: "book_existing",
      alreadyClaimed: true,
      templateName: "Mathe Vorlage",
    });
    expect(calls.bookCreateData).toBeNull();
  });

  it("rejects invite claims from a different email", async () => {
    const share = createShareFixture({
      kind: "INVITE",
      recipientEmail: "recipient@example.de",
    });
    const { db } = createClaimDb(share);

    await expect(
      claimTemplateShareForUser(db, {
        token: "token_1",
        userId: "user_1",
        userEmail: "other@example.de",
      }),
    ).rejects.toThrow("andere E-Mail-Adresse");
  });

  it("rejects invite claims once another user consumed the invite", async () => {
    const share = createShareFixture({
      kind: "INVITE",
      recipientEmail: "recipient@example.de",
    });
    const { db } = createClaimDb(share, {
      claimedInviteUserId: "user_2",
    });

    await expect(
      claimTemplateShareForUser(db, {
        token: "token_1",
        userId: "user_1",
        userEmail: "recipient@example.de",
      }),
    ).rejects.toThrow("bereits beansprucht");
  });

  it("recovers idempotently when a concurrent claim already created the book", async () => {
    const share = createShareFixture();
    const { db } = createClaimDb(share, {
      transactionError: { code: "P2002" },
      recoveryBookId: "book_existing",
    });

    const result = await claimTemplateShareForUser(db, {
      token: "token_1",
      userId: "user_1",
      userEmail: "user@example.de",
    });

    expect(result).toEqual({
      bookId: "book_existing",
      alreadyClaimed: true,
      templateName: "Mathe Vorlage",
    });
  });
});
