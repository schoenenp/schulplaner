import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createCallerFactory } from "@/server/api/trpc";
import { hashTemplateShareToken } from "@/util/template-share";

const sentEmails: Array<[string, string, string]> = [];

mock.module("@/util/order/functions", () => ({
  sendOrderVerification: async (to: string, subject: string, html: string) => {
    sentEmails.push([to, subject, html]);
    return { messageId: "msg_template_share_test" };
  },
}));

const { templateShareRouter } = await import("./template-share");
const createCaller = createCallerFactory(templateShareRouter);

type ShareCreateArgs = {
  data: {
    templateId: string;
    createdById: string;
    kind: "LINK" | "INVITE";
    recipientEmail?: string;
    tokenHash: string;
    expiresAt: Date;
  };
};

function expectShareCreateArgs(value: ShareCreateArgs | null): ShareCreateArgs {
  expect(value).not.toBeNull();
  if (!value) {
    throw new Error("Expected templateShare.create to be called");
  }
  return value;
}

function createHeaders(ipSuffix: string) {
  return new Headers({
    host: "app.example.de",
    "x-forwarded-for": `203.0.113.${ipSuffix}`,
    "x-forwarded-proto": "https",
  });
}

function createSession(
  overrides: Partial<{
    id: string;
    role: "ADMIN" | "STAFF" | "MODERATOR" | "USER" | "SPONSOR" | "PARTNER";
    email: string;
  }> = {},
) {
  return {
    user: {
      id: overrides.id ?? "staff_1",
      role: overrides.role ?? "STAFF",
      email: overrides.email ?? "staff@example.de",
    },
    expires: "2099-01-01T00:00:00.000Z",
  };
}

describe("templateShareRouter", () => {
  beforeEach(() => {
    sentEmails.length = 0;
  });

  it("creates a share link for an owned active template", async () => {
    let bookFindArgs: unknown;
    let shareCreateArgs: ShareCreateArgs | null = null;

    const caller = createCaller({
      db: {
        book: {
          findFirst: async (args: unknown) => {
            bookFindArgs = args;
            return {
              id: "template_1",
              name: "Mathe Vorlage",
              bookTitle: "Mathe Planer",
              isTemplate: true,
            };
          },
        },
        templateShare: {
          create: async (args: ShareCreateArgs) => {
            shareCreateArgs = args;
            return { id: "share_1" };
          },
        },
      } as never,
      headers: createHeaders("10"),
      session: createSession(),
      config: { id: "cfg_test" },
    });

    const result = await caller.createLink({
      templateId: "template_1",
      validForDays: 7,
    });

    expect(result.token).toHaveLength(64);
    expect(result.shareUrl).toBe(
      `https://app.example.de/template/share?claim=${result.token}`,
    );
    expect(bookFindArgs).toMatchObject({
      where: {
        id: "template_1",
        createdById: "staff_1",
        isTemplate: true,
        deletedAt: null,
      },
    });
    const createdShare = expectShareCreateArgs(shareCreateArgs);
    expect(createdShare).toMatchObject({
      data: {
        templateId: "template_1",
        createdById: "staff_1",
        kind: "LINK",
        tokenHash: hashTemplateShareToken(result.token),
      },
    });
    expect(createdShare.data.recipientEmail).toBeUndefined();
  });

  it("sends a normalized invite with a direct claim URL", async () => {
    let shareCreateArgs: ShareCreateArgs | null = null;

    const caller = createCaller({
      db: {
        book: {
          findFirst: async () => ({
            id: "template_1",
            name: "Mathe Vorlage",
            bookTitle: "Mathe Planer",
            isTemplate: true,
          }),
        },
        templateShare: {
          create: async (args: ShareCreateArgs) => {
            shareCreateArgs = args;
            return { id: "share_1" };
          },
        },
      } as never,
      headers: createHeaders("11"),
      session: createSession(),
      config: { id: "cfg_test" },
    });

    const result = await caller.sendInvite({
      templateId: "template_1",
      email: " School@Example.DE ",
      validForDays: 5,
    });

    expect(result.inviteSent).toBeTrue();
    expect(result.email).toBe("sc***l@example.de");
    expect(expectShareCreateArgs(shareCreateArgs)).toMatchObject({
      data: {
        templateId: "template_1",
        createdById: "staff_1",
        kind: "INVITE",
        recipientEmail: "school@example.de",
      },
    });
    expect(sentEmails.length).toBe(1);
    expect(sentEmails[0]?.[0]).toBe("school@example.de");
    expect(sentEmails[0]?.[1]).toBe("Planer-Vorlage beanspruchen");
    expect(sentEmails[0]?.[2]).toContain(
      "https://app.example.de/template/share/claim?token=",
    );
  });

  it("rejects share creation for a user without template permissions", async () => {
    let bookLookupCalled = false;
    const caller = createCaller({
      db: {
        book: {
          findFirst: async () => {
            bookLookupCalled = true;
            return null;
          },
        },
      } as never,
      headers: createHeaders("12"),
      session: createSession({ role: "USER" }),
      config: { id: "cfg_test" },
    });

    await expect(
      caller.createLink({ templateId: "template_1" }),
    ).rejects.toThrow("Template-Freigaben");
    expect(bookLookupCalled).toBeFalse();
  });

  it("returns masked public share metadata for valid tokens", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const caller = createCaller({
      db: {
        templateShare: {
          findUnique: async ({ where }: { where: { tokenHash: string } }) => {
            expect(where.tokenHash).toBe(hashTemplateShareToken("token_1"));
            return {
              kind: "INVITE",
              recipientEmail: "school@example.de",
              expiresAt,
              revokedAt: null,
              template: {
                isTemplate: true,
                deletedAt: null,
                name: "Mathe Vorlage",
                bookTitle: "Mathe Planer",
                modules: [{ id: "bm_1" }, { id: "bm_2" }],
              },
            };
          },
        },
      } as never,
      headers: createHeaders("13"),
      session: null,
      config: { id: "cfg_test" },
    });

    const result = await caller.getShare({ token: "token_1" });

    expect(result).toEqual({
      kind: "INVITE",
      expiresAt,
      recipientEmail: "sc***l@example.de",
      template: {
        name: "Mathe Vorlage",
        moduleCount: 2,
      },
    });
  });
});
