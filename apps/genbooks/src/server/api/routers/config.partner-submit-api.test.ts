import { describe, expect, it, mock } from "bun:test";
import { createCallerFactory } from "@/server/api/trpc";
import { createPartnerCheckoutToken } from "@/util/partner-link";

let notificationCreates = 0;
let transitionCreates = 0;

mock.module("@/util/pdf", () => ({
  calculatePdfPageCounts: async () => ({
    bPages: 0,
    cPages: 120,
    fullPageCount: 120,
  }),
}));

mock.module("@/util/pdf/calculator", () => ({
  calculatePrintCost: () => ({
    single: 1000,
    total: 1000,
  }),
}));

mock.module("@/util/module-files", () => ({
  pickModulePdfFile: () => ({ src: "/planner.pdf" }),
  pickCoverImageFile: () => undefined,
}));

mock.module("@/util/book/clone-book", () => ({
  cloneBookForOrder: async () => "book_order_1",
}));

mock.module("@/util/stripe", () => ({
  stripeClient: {
    promotionCodes: {
      retrieve: async () => ({
        id: "promo_1",
        code: "PROMO123",
        active: true,
        max_redemptions: null,
        times_redeemed: 0,
        expires_at: null,
        metadata: {
          kind: "partner_campaign",
          partnerUserId: "partner_1",
          templateId: "tmpl_1",
          snapshotBookId: "snapshot_1",
          partnerAccountId: "acct_123",
          promotionCodeId: "promo_1",
        },
      }),
    },
    customers: {
      list: async () => ({ data: [] }),
      create: async () => ({ id: "cus_1" }),
      update: async () => ({ id: "cus_1" }),
    },
  },
  toStripeAddress: () => ({
    country: "AT",
    city: "Wien",
    line1: "Street 1",
    postal_code: "1010",
  }),
}));

mock.module("@/util/book/binding-rules", () => ({
  isBindingAllowedForTotalPages: () => true,
  getBindingLimitMessage: () => null,
}));

mock.module("@/util/order/functions", () => ({
  default: (id: number) => `ORD-${id}`,
  createCancelKey: () => "cancel-key",
  sendOrderVerification: async () => ({ messageId: "email_1" }),
}));

mock.module("@/util/order/templates/create-validation-order", () => ({
  createOrderConfirmationEmail: async () => "<html>ok</html>",
}));

const { configRouter } = await import("./config");
const createCaller = createCallerFactory(configRouter);

const baseHeaders = new Headers({
  "x-forwarded-for": "198.51.100.42",
});

describe("configRouter partner submit API", () => {
  it("creates partner notification on partner-template submit", async () => {
    notificationCreates = 0;
    transitionCreates = 0;

    const db = {
      book: {
        findFirst: async ({ where }: { where: { id: string } }) => {
          if (where.id === "snapshot_1") {
            return {
              id: "snapshot_1",
              bookTitle: "Snapshot",
              planStart: new Date("2026-01-01T00:00:00.000Z"),
              planEnd: new Date("2026-12-31T00:00:00.000Z"),
              region: "AT-W",
              country: "AT",
              modules: [
                {
                  id: "bm_1",
                  idx: 1,
                  colorCode: "COLOR",
                  moduleId: "m1",
                  module: {
                    id: "m1",
                    name: "Planner",
                    theme: null,
                    part: "PLANNER",
                    type: { name: "Planner" },
                    files: [],
                  },
                },
              ],
            };
          }
          return {
            id: "book_1",
            name: "School Planner",
            createdById: "school_1",
            copyFromId: "snapshot_1",
            sourceType: "PARTNER_TEMPLATE",
            partnerClaimId: "claim_1",
            partnerClaim: { userId: "school_1" },
            bookTitle: "School Planner",
            planStart: new Date("2026-01-01T00:00:00.000Z"),
            planEnd: new Date("2026-12-31T00:00:00.000Z"),
            region: "AT-W",
            country: "AT",
            modules: [
              {
                id: "bm_1",
                idx: 1,
                colorCode: "COLOR",
                moduleId: "m1",
                module: {
                  id: "m1",
                  name: "Planner",
                  theme: null,
                  part: "PLANNER",
                  type: { name: "Planner" },
                  files: [],
                },
              },
            ],
          };
        },
      },
      user: {
        findUnique: async () => ({
          id: "school_1",
          email: "school@example.at",
        }),
      },
      partnerOrder: {
        findUnique: async ({ where }: { where: { bookId: string } }) =>
          where.bookId === "book_1" ? null : { id: "po_1" },
        create: async () => ({ id: "po_1" }),
        updateMany: async () => ({ count: 1 }),
      },
      partnerNotification: {
        create: async () => {
          notificationCreates += 1;
          return { id: "pn_1" };
        },
      },
      partnerOrderTransition: {
        create: async () => {
          transitionCreates += 1;
          return { id: "pot_1" };
        },
      },
      payment: {
        create: async () => ({ id: "pay_1" }),
      },
      $transaction: async (
        cb: (tx: {
          payment: { update: (args: unknown) => Promise<unknown> };
          order: {
            create: (args: unknown) => Promise<{ id: number }>;
            update: (args: unknown) => Promise<unknown>;
          };
        }) => Promise<{ id: number; orderKey: string }>,
      ) =>
        cb({
          payment: {
            update: async () => ({}),
          },
          order: {
            create: async () => ({ id: 77 }),
            update: async () => ({}),
          },
        }),
    };

    const caller = createCaller({
      db: db as never,
      headers: baseHeaders,
      session: {
        user: { id: "school_1", role: "USER" },
        expires: "2099-01-01T00:00:00.000Z",
      },
      config: { id: "cfg_test" },
    });

    const result = await caller.setupOrder({
      details: {
        bookId: "book_1",
        isPickup: true,
        format: "DIN A5",
        quantity: 100,
        saveUser: false,
        partnerToken: createPartnerCheckoutToken({
          partnerUserId: "partner_1",
          templateId: "tmpl_1",
          snapshotBookId: "snapshot_1",
          promotionCodeId: "promo_1",
          promotionCode: "PROMO123",
        }),
      },
      orderAddress: {
        prename: "Max",
        name: "Mustermann",
        street: "Hauptstraße",
        streetNr: "1",
        city: "Wien",
        zip: "1010",
        email: "school@example.at",
      },
    });

    expect(result.redirect_url).toContain("/payment/success");
    expect(notificationCreates).toBe(1);
    expect(transitionCreates).toBeGreaterThanOrEqual(1);
  });
});
