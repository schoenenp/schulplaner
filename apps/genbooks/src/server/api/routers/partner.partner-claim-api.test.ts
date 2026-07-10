import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createCallerFactory } from "@/server/api/trpc";
import { createPartnerCampaignLinkToken } from "@/util/partner-link";

const promotionRetrieveCalls: Array<[string]> = [];
const sentVerificationEmails: Array<[string, string, string]> = [];

let promotionRetrieveImpl: (promotionCodeId: string) => Promise<{
  id: string;
  active: boolean;
  expires_at: number | null;
  code: string;
  metadata: Record<string, string>;
}> = async () => {
  throw new Error("promotionRetrieveImpl not set");
};

mock.module("@/util/stripe", () => ({
  stripeClient: {
    promotionCodes: {
      retrieve: async (promotionCodeId: string) => {
        promotionRetrieveCalls.push([promotionCodeId]);
        return promotionRetrieveImpl(promotionCodeId);
      },
    },
  },
}));

mock.module("@/util/order/functions", () => ({
  sendOrderVerification: async (to: string, subject: string, html: string) => {
    sentVerificationEmails.push([to, subject, html]);
    return { messageId: "msg_test" };
  },
}));

const { partnerRouter } = await import("./partner");
const createCaller = createCallerFactory(partnerRouter);

const baseHeaders = new Headers({
  "x-forwarded-for": "203.0.113.55",
});

function futureUnix(days = 30): number {
  return Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
}

function createClaimToken() {
  return createPartnerCampaignLinkToken({
    partnerUserId: "partner_1",
    templateId: "template_1",
    snapshotBookId: "snapshot_1",
    promotionCodeId: "promo_1",
    exp: futureUnix(30),
  });
}

describe("partnerRouter partner claim APIs", () => {
  beforeEach(() => {
    promotionRetrieveCalls.length = 0;
    sentVerificationEmails.length = 0;
    promotionRetrieveImpl = async () => ({
      id: "promo_1",
      active: true,
      expires_at: futureUnix(30),
      code: "SP-AB12CD34",
      metadata: {
        kind: "partner_campaign",
        partnerUserId: "partner_1",
        templateId: "template_1",
        snapshotBookId: "snapshot_1",
      },
    });
  });

  it("startPartnerClaim creates pending claim and sends verification email", async () => {
    const partnerClaimCreateCalls: unknown[] = [];
    const partnerClaimUpdateManyCalls: unknown[] = [];
    const campaignFindCalls: unknown[] = [];

    const caller = createCaller({
      db: {
        partnerClaim: {
          updateMany: async (args: unknown) => {
            partnerClaimUpdateManyCalls.push(args);
            return { count: 0 };
          },
          create: async (args: unknown) => {
            partnerClaimCreateCalls.push(args);
            return { id: "pc_1" };
          },
        },
        campaign: {
          findUnique: async (args: unknown) => {
            campaignFindCalls.push(args);
            return { id: "db_campaign_1" };
          },
        },
      } as never,
      headers: baseHeaders,
      session: null,
      config: { id: "cfg_test" },
    });

    const result = await caller.startPartnerClaim({
      token: createClaimToken(),
      promoCode: "sp-ab12cd34",
      email: "School@Example.at",
    });

    expect(result.verificationSent).toBeTrue();
    expect(result.email).toContain("@example.at");
    expect(promotionRetrieveCalls.length).toBe(1);
    expect(campaignFindCalls.length).toBe(1);
    expect(partnerClaimUpdateManyCalls.length).toBe(1);
    expect(partnerClaimCreateCalls.length).toBe(1);
    expect(sentVerificationEmails.length).toBe(1);
    expect(sentVerificationEmails[0]?.[0]).toBe("school@example.at");
  });

  it("completePartnerClaim rejects when session email differs from claim email", async () => {
    let transactionCalled = false;

    const caller = createCaller({
      db: {
        user: {
          findUnique: async () => ({ id: "user_1", email: "owner@example.at" }),
        },
        partnerClaim: {
          findUnique: async () => ({
            id: "pc_1",
            promotionCodeId: "promo_1",
            snapshotBookId: "snapshot_1",
            email: "different@example.at",
            bookId: null,
            expiresAt: new Date(Date.now() + 60_000),
          }),
        },
        $transaction: async () => {
          transactionCalled = true;
          throw new Error("should not be called");
        },
      } as never,
      headers: baseHeaders,
      session: {
        user: { id: "user_1", role: "USER" },
        expires: "2099-01-01T00:00:00.000Z",
      },
      config: { id: "cfg_test" },
    });

    await expect(
      caller.completePartnerClaim({
        claimToken: "token_1",
      }),
    ).rejects.toThrow("Diese E-Mail passt nicht zum Partner-Angebot.");

    expect(transactionCalled).toBeFalse();
  });

  it("completePartnerClaim is idempotent when claim already has a book", async () => {
    let transactionCalled = false;

    const caller = createCaller({
      db: {
        user: {
          findUnique: async () => ({ id: "user_1", email: "owner@example.at" }),
        },
        partnerClaim: {
          findUnique: async () => ({
            id: "pc_1",
            promotionCodeId: "promo_1",
            snapshotBookId: "snapshot_1",
            email: "owner@example.at",
            bookId: "book_123",
            expiresAt: new Date(Date.now() + 60_000),
          }),
        },
        $transaction: async () => {
          transactionCalled = true;
          throw new Error("should not be called");
        },
      } as never,
      headers: baseHeaders,
      session: {
        user: { id: "user_1", role: "USER" },
        expires: "2099-01-01T00:00:00.000Z",
      },
      config: { id: "cfg_test" },
    });

    const result = await caller.completePartnerClaim({
      claimToken: "token_2",
    });

    expect(result.bookId).toBe("book_123");
    expect(result.partnerCheckoutToken.length).toBeGreaterThan(20);
    expect(transactionCalled).toBeFalse();
    expect(promotionRetrieveCalls.length).toBe(1);
  });

  it("completePartnerClaim clones and consumes claim once on first completion", async () => {
    let campaignRedeemed = 0;
    let claimUpdated = false;

    const caller = createCaller({
      db: {
        user: {
          findUnique: async () => ({ id: "user_1", email: "owner@example.at" }),
        },
        partnerClaim: {
          findUnique: async () => ({
            id: "pc_1",
            promotionCodeId: "promo_1",
            snapshotBookId: "snapshot_1",
            email: "owner@example.at",
            bookId: null,
            expiresAt: new Date(Date.now() + 60_000),
          }),
        },
        $transaction: async (
          callback: (tx: {
            campaign: {
              findUnique: (args: unknown) => Promise<{ id: string; maxRedemptions: number }>;
              updateMany: (args: unknown) => Promise<{ count: number }>;
            };
            book: {
              findFirst: (args: unknown) => Promise<{
                id: string;
                name: string | null;
                bookTitle: string | null;
                subTitle: string | null;
                format: string;
                region: string | null;
                planStart: Date;
                planEnd: Date | null;
                country: string;
                modules: Array<{ idx: number; moduleId: string; colorCode: "COLOR" | "GRAYSCALE" | null }>;
              }>;
              create: (args: unknown) => Promise<{ id: string }>;
            };
            partnerClaim: {
              update: (args: unknown) => Promise<{ id: string }>;
            };
          }) => Promise<{ id: string }>,
        ) => {
          return callback({
            campaign: {
              findUnique: async () => ({ id: "db_campaign_1", maxRedemptions: 10 }),
              updateMany: async () => {
                campaignRedeemed += 1;
                return { count: 1 };
              },
            },
            book: {
              findFirst: async () => ({
                id: "snapshot_1",
                name: "Template A",
                bookTitle: "Planner",
                subTitle: "School",
                format: "A5",
                region: "AT-9",
                planStart: new Date("2026-09-01T00:00:00.000Z"),
                planEnd: new Date("2027-07-01T00:00:00.000Z"),
                country: "AT",
                modules: [{ idx: 0, moduleId: "m_1", colorCode: "COLOR" }],
              }),
              create: async () => ({ id: "book_new_1" }),
            },
            partnerClaim: {
              update: async () => {
                claimUpdated = true;
                return { id: "pc_1" };
              },
            },
          });
        },
      } as never,
      headers: baseHeaders,
      session: {
        user: { id: "user_1", role: "USER" },
        expires: "2099-01-01T00:00:00.000Z",
      },
      config: { id: "cfg_test" },
    });

    const result = await caller.completePartnerClaim({
      claimToken: "token_3",
    });

    expect(result.bookId).toBe("book_new_1");
    expect(result.partnerCheckoutToken.length).toBeGreaterThan(20);
    expect(campaignRedeemed).toBe(1);
    expect(claimUpdated).toBeTrue();
  });

  it("runs end-to-end claim flow from start to resume listing", async () => {
    const state = {
      claims: [] as Array<{
        id: string;
        campaignId: string | null;
        promotionCodeId: string;
        snapshotBookId: string;
        email: string;
        status: "PENDING" | "CONSUMED" | "EXPIRED";
        verifyTokenHash: string;
        expiresAt: Date;
        userId: string | null;
        bookId: string | null;
        updatedAt: Date;
      }>,
      books: new Map<string, { id: string; name: string; updatedAt: Date }>(),
      redemptions: 0,
    };

    const publicCaller = createCaller({
      db: {
        campaign: {
          findUnique: async () => ({ id: "db_campaign_1" }),
        },
        partnerClaim: {
          updateMany: async ({
            where,
          }: {
            where: { promotionCodeId: string; email: string; status: "PENDING" };
          }) => {
            let count = 0;
            for (const claim of state.claims) {
              if (
                claim.promotionCodeId === where.promotionCodeId &&
                claim.email === where.email &&
                claim.status === where.status
              ) {
                claim.status = "EXPIRED";
                claim.updatedAt = new Date();
                count += 1;
              }
            }
            return { count };
          },
          create: async ({
            data,
          }: {
            data: {
              campaignId?: string | null;
              promotionCodeId: string;
              snapshotBookId: string;
              email: string;
              status: "PENDING";
              verifyTokenHash: string;
              expiresAt: Date;
            };
          }) => {
            state.claims.push({
              id: `pc_${state.claims.length + 1}`,
              campaignId: data.campaignId ?? null,
              promotionCodeId: data.promotionCodeId,
              snapshotBookId: data.snapshotBookId,
              email: data.email,
              status: data.status,
              verifyTokenHash: data.verifyTokenHash,
              expiresAt: data.expiresAt,
              userId: null,
              bookId: null,
              updatedAt: new Date(),
            });
            return { id: `pc_${state.claims.length}` };
          },
        },
      } as never,
      headers: baseHeaders,
      session: null,
      config: { id: "cfg_test" },
    });

    await publicCaller.startPartnerClaim({
      token: createClaimToken(),
      promoCode: "SP-AB12CD34",
      email: "school@example.at",
    });

    const claimEmailHtml = sentVerificationEmails[sentVerificationEmails.length - 1]?.[2];
    expect(typeof claimEmailHtml).toBe("string");
    const tokenMatch = claimEmailHtml?.match(/claim=([^"]+)/);
    expect(tokenMatch?.[1]).toBeString();
    const claimToken = decodeURIComponent(tokenMatch![1]!);

    const protectedCaller = createCaller({
      db: {
        user: {
          findUnique: async () => ({ id: "user_1", email: "school@example.at" }),
        },
        campaign: {
          findUnique: async () => ({ id: "db_campaign_1", maxRedemptions: 10 }),
          updateMany: async () => {
            state.redemptions += 1;
            return { count: 1 };
          },
        },
        book: {
          findFirst: async () => ({
            id: "snapshot_1",
            name: "Template Snapshot",
            bookTitle: "Planner",
            subTitle: "School",
            format: "A5",
            region: "AT-9",
            planStart: new Date("2026-09-01T00:00:00.000Z"),
            planEnd: new Date("2027-07-01T00:00:00.000Z"),
            country: "AT",
            modules: [{ idx: 0, moduleId: "m_1", colorCode: "COLOR" as const }],
          }),
          create: async () => {
            const id = `book_${state.books.size + 1}`;
            const book = {
              id,
              name: "Partnered Planner",
              updatedAt: new Date(),
            };
            state.books.set(id, book);
            return { id };
          },
        },
        partnerClaim: {
          findUnique: async ({
            where,
          }: {
            where: { verifyTokenHash: string };
          }) =>
            state.claims.find((claim) => claim.verifyTokenHash === where.verifyTokenHash) ??
            null,
          update: async ({
            where,
            data,
          }: {
            where: { id: string };
            data: {
              status?: "CONSUMED" | "EXPIRED";
              verifiedAt?: Date;
              consumedAt?: Date;
              userId?: string;
              bookId?: string;
            };
          }) => {
            const claim = state.claims.find((item) => item.id === where.id);
            if (!claim) throw new Error("claim missing");
            if (data.status) claim.status = data.status;
            if (typeof data.userId === "string") claim.userId = data.userId;
            if (typeof data.bookId === "string") claim.bookId = data.bookId;
            claim.updatedAt = new Date();
            return { id: claim.id };
          },
          findMany: async ({
            where,
          }: {
            where: { userId: string };
          }) =>
            state.claims
              .filter((claim) => claim.userId === where.userId)
              .map((claim) => ({
                id: claim.id,
                status: claim.status,
                promotionCodeId: claim.promotionCodeId,
                snapshotBookId: claim.snapshotBookId,
                expiresAt: claim.expiresAt,
                updatedAt: claim.updatedAt,
                book: claim.bookId ? state.books.get(claim.bookId) ?? null : null,
              })),
        },
        $transaction: async (callback: (tx: unknown) => Promise<{ id: string }>) =>
          callback({
            campaign: {
              findUnique: async () => ({ id: "db_campaign_1", maxRedemptions: 10 }),
              updateMany: async () => {
                state.redemptions += 1;
                return { count: 1 };
              },
            },
            book: {
              findFirst: async () => ({
                id: "snapshot_1",
                name: "Template Snapshot",
                bookTitle: "Planner",
                subTitle: "School",
                format: "A5",
                region: "AT-9",
                planStart: new Date("2026-09-01T00:00:00.000Z"),
                planEnd: new Date("2027-07-01T00:00:00.000Z"),
                country: "AT",
                modules: [{ idx: 0, moduleId: "m_1", colorCode: "COLOR" as const }],
              }),
              create: async () => {
                const id = `book_${state.books.size + 1}`;
                state.books.set(id, {
                  id,
                  name: "Partnered Planner",
                  updatedAt: new Date(),
                });
                return { id };
              },
            },
            partnerClaim: {
              update: async ({
                where,
                data,
              }: {
                where: { id: string };
                data: { status: "CONSUMED"; userId: string; bookId: string };
              }) => {
                const claim = state.claims.find((item) => item.id === where.id);
                if (!claim) throw new Error("claim missing");
                claim.status = data.status;
                claim.userId = data.userId;
                claim.bookId = data.bookId;
                claim.updatedAt = new Date();
                return { id: claim.id };
              },
            },
          }),
      } as never,
      headers: baseHeaders,
      session: {
        user: { id: "user_1", role: "USER" },
        expires: "2099-01-01T00:00:00.000Z",
      },
      config: { id: "cfg_test" },
    });

    const completed = await protectedCaller.completePartnerClaim({ claimToken });
    expect(completed.bookId.startsWith("book_")).toBeTrue();
    expect(state.redemptions).toBe(1);

    const claims = await protectedCaller.listPartnerClaims();
    expect(claims.length).toBe(1);
    expect(claims[0]?.book?.id).toBe(completed.bookId);
    expect(claims[0]?.status).toBe("CONSUMED");
  });
});
