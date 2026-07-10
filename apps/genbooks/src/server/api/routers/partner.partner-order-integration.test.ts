import { describe, expect, it, mock } from "bun:test";
import { createCallerFactory } from "@/server/api/trpc";

const sentShopEmails: string[] = [];

mock.module("@/util/order/functions", () => ({
  sendOrderVerification: async (_to: string, subject: string) => {
    sentShopEmails.push(subject);
    return { messageId: "msg_1" };
  },
}));

mock.module("@/util/order/templates/create-validation-order", () => ({
  createOrderConfirmationEmail: async (orderKey: string) =>
    `<html><body>${orderKey}</body></html>`,
}));

mock.module("@/util/partner-program/invoices", () => ({
  createPartnerSchoolInvoice: async () => ({
    invoiceId: "in_school_1",
    hostedInvoiceUrl: "https://stripe.test/in_school_1",
    issuedAt: "2026-03-07T12:00:00.000Z",
    issuerSnapshot: {
      partnerUserId: "partner_1",
      partnerName: "Partner GmbH",
      partnerEmail: "partner@example.at",
      legalFooter: "in Partnerschaft mit Digitaldruck Pirrot GmbH",
      confirmedAt: "2026-03-07T12:00:00.000Z",
      invoiceCountryPath: "AT",
      eInvoiceCompatibilityPath: "AT_EBINTERFACE_PREP",
    },
  }),
}));

const { partnerRouter } = await import("./partner");
const createCaller = createCallerFactory(partnerRouter);

const baseHeaders = new Headers({
  "x-forwarded-for": "198.51.100.42",
});

describe("partner order integration-like flows", () => {
  it("school submit state -> confirm -> release", async () => {
    sentShopEmails.length = 0;
    const state = {
      status: "UNDER_PARTNER_REVIEW" as
        | "UNDER_PARTNER_REVIEW"
        | "PARTNER_CONFIRMED"
        | "RELEASED_TO_PRODUCTION",
      updatedAt: new Date("2026-03-07T09:00:00.000Z"),
      transitions: 0,
    };

    const caller = createCaller({
      db: {
        user: {
          findUnique: async () => ({
            role: "SPONSOR",
            id: "partner_1",
            name: "Partner GmbH",
            email: "partner@example.at",
          }),
        },
        partnerOrder: {
          findFirst: async () => ({
            id: "po_int_1",
            status: state.status,
            updatedAt: state.updatedAt,
            schoolSnapshot: { email: "school@example.at" },
            lineItemsSnapshot: { quantity: 100 },
            partnerUserId: "partner_1",
            order: { id: 10, orderKey: "ORD-INT-10" },
            book: { id: "book_1", name: "Book 1" },
          }),
          updateMany: async ({ where, data }: { where: { status?: string }; data: { status: string; releasedAt?: Date | null } }) => {
            if (where.status === "UNDER_PARTNER_REVIEW" && state.status === "UNDER_PARTNER_REVIEW") {
              state.status = data.status as typeof state.status;
              state.updatedAt = new Date("2026-03-07T09:05:00.000Z");
              return { count: 1 };
            }
            if (where.status === "PARTNER_CONFIRMED" && state.status === "PARTNER_CONFIRMED") {
              state.status = data.status as typeof state.status;
              return { count: 1 };
            }
            return { count: 0 };
          },
        },
        partnerNotification: {
          create: async () => ({ id: "pn_1" }),
        },
        partnerOrderTransition: {
          create: async () => {
            state.transitions += 1;
            return { id: `pot_${state.transitions}` };
          },
        },
      } as never,
      headers: baseHeaders,
      session: {
        user: { id: "partner_1", role: "SPONSOR" },
        expires: "2099-01-01T00:00:00.000Z",
      },
      config: { id: "cfg_test" },
    });

    const confirmResult = await caller.confirmPartnerOrder({
      partnerOrderId: "po_int_1",
    });
    expect(confirmResult.confirmed).toBeTrue();

    const releaseResult = await caller.releasePartnerOrderToProduction({
      partnerOrderId: "po_int_1",
    });
    expect(releaseResult.released).toBeTrue();
    expect(sentShopEmails.length).toBe(1);
    expect(state.transitions).toBe(2);
  });

  it("school submit state -> decline", async () => {
    const state = {
      status: "UNDER_PARTNER_REVIEW" as "UNDER_PARTNER_REVIEW" | "PARTNER_DECLINED",
      updatedAt: new Date("2026-03-07T09:00:00.000Z"),
      transitions: 0,
    };

    const caller = createCaller({
      db: {
        user: {
          findUnique: async () => ({
            role: "SPONSOR",
            id: "partner_1",
            name: "Partner GmbH",
            email: "partner@example.at",
          }),
        },
        partnerOrder: {
          findFirst: async () => ({
            id: "po_int_2",
            status: state.status,
            updatedAt: state.updatedAt,
          }),
          updateMany: async ({ where, data }: { where: { status?: string }; data: { status: string } }) => {
            if (where.status === "UNDER_PARTNER_REVIEW" && state.status === "UNDER_PARTNER_REVIEW") {
              state.status = data.status as typeof state.status;
              return { count: 1 };
            }
            return { count: 0 };
          },
        },
        partnerOrderTransition: {
          create: async () => {
            state.transitions += 1;
            return { id: `pot_${state.transitions}` };
          },
        },
      } as never,
      headers: baseHeaders,
      session: {
        user: { id: "partner_1", role: "SPONSOR" },
        expires: "2099-01-01T00:00:00.000Z",
      },
      config: { id: "cfg_test" },
    });

    const declineResult = await caller.declinePartnerOrder({
      partnerOrderId: "po_int_2",
      reason: "Daten unvollständig",
    });
    expect(declineResult.declined).toBeTrue();
    expect(state.status).toBe("PARTNER_DECLINED");
    expect(state.transitions).toBe(1);
  });
});
