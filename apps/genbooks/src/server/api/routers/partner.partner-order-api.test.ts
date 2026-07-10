import { describe, expect, it, mock } from "bun:test";
import { createCallerFactory } from "@/server/api/trpc";

const sentEmails: Array<{ to: string; subject: string; html: string }> = [];

mock.module("@/util/order/functions", () => ({
  sendOrderVerification: async (to: string, subject: string, html: string) => {
    sentEmails.push({ to, subject, html });
    return { messageId: "partner_release_msg" };
  },
}));

mock.module("@/util/order/templates/create-validation-order", () => ({
  createOrderConfirmationEmail: async (orderKey: string, customerName: string) =>
    `<html><body>${orderKey}:${customerName}</body></html>`,
}));

mock.module("@/util/partner-program/invoices", () => ({
  createPartnerSchoolInvoice: async () => ({
    invoiceId: "in_partner_school_1",
    hostedInvoiceUrl: "https://stripe.test/in_partner_school_1",
    issuedAt: "2026-03-07T11:00:00.000Z",
    issuerSnapshot: {
      partnerUserId: "partner_1",
      partnerName: "Partner GmbH",
      partnerEmail: "partner@example.at",
      legalFooter: "in Partnerschaft mit Digitaldruck Pirrot GmbH",
      confirmedAt: "2026-03-07T11:00:00.000Z",
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

describe("partnerRouter partner order APIs", () => {
  it("returns partner order details for owner", async () => {
    const caller = createCaller({
      db: {
        user: {
          findUnique: async () => ({ role: "SPONSOR" }),
        },
        partnerOrder: {
          findFirst: async () => ({
            id: "po_1",
            status: "UNDER_PARTNER_REVIEW",
            submittedAt: new Date("2026-03-07T10:00:00.000Z"),
            reviewedAt: null,
            declineReason: null,
            releasedAt: null,
            fulfilledAt: null,
            schoolSnapshot: { email: "school@example.at" },
            partnerSnapshot: { name: "Partner GmbH" },
            lineItemsSnapshot: { quantity: 100 },
            sourceCampaignId: "promo_1",
            sourceClaimId: "claim_1",
            book: {
              id: "book_1",
              name: "Partnered Planner",
              updatedAt: new Date("2026-03-07T10:00:00.000Z"),
            },
            order: {
              id: 101,
              orderKey: "ORD-XYZ-101",
              status: "PENDING",
              createdAt: new Date("2026-03-07T10:00:00.000Z"),
            },
            schoolUser: {
              id: "school_1",
              email: "school@example.at",
              name: "School User",
            },
          }),
        },
      } as never,
      headers: baseHeaders,
      session: {
        user: { id: "partner_1", role: "SPONSOR" },
        expires: "2099-01-01T00:00:00.000Z",
      },
      config: { id: "cfg_test" },
    });

    const result = await caller.getPartnerOrderById({ partnerOrderId: "po_1" });
    expect(result.id).toBe("po_1");
    expect(result.book.id).toBe("book_1");
    expect(result.order?.orderKey).toBe("ORD-XYZ-101");
  });

  it("releases confirmed partner order and stays idempotent on second call", async () => {
    sentEmails.length = 0;
    const state = {
      status: "PARTNER_CONFIRMED" as "PARTNER_CONFIRMED" | "RELEASED_TO_PRODUCTION",
      releasedAt: null as Date | null,
      notifications: 0,
      transitions: 0,
    };

    const caller = createCaller({
      db: {
        user: {
          findUnique: async () => ({ role: "SPONSOR" }),
        },
        partnerOrder: {
          findFirst: async () => ({
            id: "po_2",
            status: state.status,
            updatedAt: new Date("2026-03-07T10:00:00.000Z"),
            partnerUserId: "partner_1",
            order: { id: 102, orderKey: "ORD-REL-102" },
            book: { id: "book_2", name: "Planner 2" },
          }),
          updateMany: async ({
            where,
            data,
          }: {
            where: {
              status?: "PARTNER_CONFIRMED" | "RELEASED_TO_PRODUCTION";
              releasedAt?: Date;
            };
            data: {
              status: "PARTNER_CONFIRMED" | "RELEASED_TO_PRODUCTION";
              releasedAt: Date | null;
            };
          }) => {
            if (
              where.status === "PARTNER_CONFIRMED" &&
              state.status === "PARTNER_CONFIRMED"
            ) {
              state.status = data.status;
              state.releasedAt = data.releasedAt;
              return { count: 1 };
            }
            if (
              where.status === "RELEASED_TO_PRODUCTION" &&
              state.status === "RELEASED_TO_PRODUCTION" &&
              where.releasedAt?.getTime() === state.releasedAt?.getTime()
            ) {
              state.status = data.status;
              state.releasedAt = data.releasedAt;
              return { count: 1 };
            }
            return { count: 0 };
          },
        },
        partnerNotification: {
          create: async () => {
            state.notifications += 1;
            return { id: "pn_1" };
          },
        },
        partnerOrderTransition: {
          create: async () => {
            state.transitions += 1;
            return { id: "pot_1" };
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

    const first = await caller.releasePartnerOrderToProduction({
      partnerOrderId: "po_2",
    });
    expect(first.released).toBeTrue();
    expect(first.alreadyReleased).toBeUndefined();
    expect(sentEmails.length).toBe(1);
    expect(sentEmails[0]?.html).toContain("Finale Partnerfreigabe");
    expect(state.notifications).toBe(1);

    const second = await caller.releasePartnerOrderToProduction({
      partnerOrderId: "po_2",
    });
    expect(second.alreadyReleased).toBeTrue();
    expect(sentEmails.length).toBe(1);
    expect(state.notifications).toBe(1);
  });

  it("declinePartnerOrder enforces reason validation", async () => {
    const caller = createCaller({
      db: {} as never,
      headers: baseHeaders,
      session: {
        user: { id: "partner_1", role: "SPONSOR" },
        expires: "2099-01-01T00:00:00.000Z",
      },
      config: { id: "cfg_test" },
    });

    await expect(
      caller.declinePartnerOrder({
        partnerOrderId: "po_3",
        reason: "x",
      }),
    ).rejects.toThrow();
  });

  it("confirmPartnerOrder stores partner snapshot with school invoice reference", async () => {
    let savedPartnerSnapshot: Record<string, unknown> | null = null;

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
            id: "po_5",
            schoolSnapshot: {
              email: "school@example.at",
              name: "Schule 1",
              address: { country: "AT" },
            },
            lineItemsSnapshot: {
              quantity: 120,
              addOnModules: "Fahrtenbuch",
            },
            status: "UNDER_PARTNER_REVIEW",
            updatedAt: new Date("2026-03-07T10:00:00.000Z"),
            order: {
              orderKey: "ORD-CNF-1",
            },
          }),
          updateMany: async ({ data }: { data: { partnerSnapshot: Record<string, unknown> } }) => {
            savedPartnerSnapshot = data.partnerSnapshot;
            return { count: 1 };
          },
        },
        partnerOrderTransition: {
          create: async () => ({ id: "pot_1" }),
        },
      } as never,
      headers: baseHeaders,
      session: {
        user: { id: "partner_1", role: "SPONSOR" },
        expires: "2099-01-01T00:00:00.000Z",
      },
      config: { id: "cfg_test" },
    });

    const result = await caller.confirmPartnerOrder({
      partnerOrderId: "po_5",
    });

    expect(result.confirmed).toBeTrue();
    expect(savedPartnerSnapshot).not.toBeNull();
    if (!savedPartnerSnapshot) {
      throw new Error("Expected partner snapshot to be written");
    }
    const snapshotRecord = savedPartnerSnapshot as unknown as Record<string, unknown>;
    const invoiceSnapshot = snapshotRecord.schoolInvoice as Record<string, unknown>;
    expect(invoiceSnapshot).toBeObject();
    expect(invoiceSnapshot.invoiceId).toBe("in_partner_school_1");
  });

  it("blocks regular users from partner order actions", async () => {
    const caller = createCaller({
      db: {
        user: {
          findUnique: async () => ({ role: "USER" }),
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
      caller.confirmPartnerOrder({
        partnerOrderId: "po_4",
      }),
    ).rejects.toThrow("Partner-Konto erforderlich");
  });
});
