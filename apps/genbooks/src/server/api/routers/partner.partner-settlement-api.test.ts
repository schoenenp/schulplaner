import { describe, expect, it, mock } from "bun:test";
import { createCallerFactory } from "@/server/api/trpc";

mock.module("@/util/partner-program/flags", () => ({
  isPartnerControlledFulfillmentEnabled: () => true,
  isPartnerSettlementEnabled: () => true,
}));

const { partnerRouter } = await import("./partner");
const createCaller = createCallerFactory(partnerRouter);

const baseHeaders = new Headers({
  "x-forwarded-for": "198.51.100.42",
});

describe("partnerRouter partner settlement APIs", () => {
  it("creates settlement batch and runs status progression", async () => {
    const state = {
      batchStatus: "DRAFT" as "DRAFT" | "FINALIZED" | "EXPORTED" | "PAID",
      batchId: "psb_1",
      created: false,
    };

    const caller = createCaller({
      db: {
        user: {
          findUnique: async () => ({ role: "SPONSOR" }),
        },
        partnerSettlementBatch: {
          findFirst: async ({ where }: { where: { id?: string; cycleStart?: Date } }) => {
            if (where.id) {
              if (!state.created || where.id !== state.batchId) return null;
              return {
                id: state.batchId,
                status: state.batchStatus,
                cycleStart: new Date("2026-03-01T00:00:00.000Z"),
                cycleEnd: new Date("2026-04-01T00:00:00.000Z"),
                summary: { orderCount: 2 },
                currency: "EUR",
                createdAt: new Date("2026-03-07T00:00:00.000Z"),
                updatedAt: new Date("2026-03-07T00:00:00.000Z"),
                finalizedAt: null,
                orders: [],
              };
            }
            return state.created ? { id: state.batchId } : null;
          },
          create: async () => {
            state.created = true;
            state.batchStatus = "DRAFT";
            return { id: state.batchId };
          },
          updateMany: async ({ where, data }: { where: { status?: string }; data: { status: "FINALIZED" | "EXPORTED" | "PAID" } }) => {
            if (where.status === state.batchStatus) {
              state.batchStatus = data.status;
              return { count: 1 };
            }
            return { count: 0 };
          },
          findMany: async () => [
            {
              id: state.batchId,
              status: state.batchStatus,
              cycleStart: new Date("2026-03-01T00:00:00.000Z"),
              cycleEnd: new Date("2026-04-01T00:00:00.000Z"),
              currency: "EUR",
              summary: { orderCount: 2 },
              createdAt: new Date("2026-03-07T00:00:00.000Z"),
              updatedAt: new Date("2026-03-07T00:00:00.000Z"),
              finalizedAt: null,
              _count: { orders: 2 },
            },
          ],
        },
        partnerOrder: {
          findMany: async () => [
            {
              id: "po_1",
              lineItemsSnapshot: {
                baseTotalAmount: 10000,
                addOnTotalAmount: 2000,
              },
              submittedAt: new Date("2026-03-05T00:00:00.000Z"),
            },
            {
              id: "po_2",
              lineItemsSnapshot: {
                baseTotalAmount: 12000,
                addOnTotalAmount: 3000,
              },
              submittedAt: new Date("2026-03-06T00:00:00.000Z"),
            },
          ],
          updateMany: async () => ({ count: 2 }),
        },
        $transaction: async (
          cb: (tx: {
            partnerSettlementBatch: { create: (args: unknown) => Promise<{ id: string }> };
            partnerOrder: { updateMany: (args: unknown) => Promise<{ count: number }> };
          }) => Promise<{ id: string }>,
        ) =>
          cb({
            partnerSettlementBatch: {
              create: async () => {
                state.created = true;
                return { id: state.batchId };
              },
            },
            partnerOrder: {
              updateMany: async () => ({ count: 2 }),
            },
          }),
      } as never,
      headers: baseHeaders,
      session: {
        user: { id: "partner_1", role: "SPONSOR" },
        expires: "2099-01-01T00:00:00.000Z",
      },
      config: { id: "cfg_test" },
    });

    const preview = await caller.previewPartnerSettlementTotals({
      cycleYear: 2026,
      cycleMonth: 3,
    });
    expect(preview.orderCount).toBe(2);
    expect(preview.totals.grandTotalAmount).toBe(27000);

    const created = await caller.createPartnerSettlementBatch({
      cycleYear: 2026,
      cycleMonth: 3,
    });
    expect(created.created).toBeTrue();

    const finalized = await caller.finalizePartnerSettlementBatch({
      batchId: "psb_1",
    });
    expect(finalized.finalized).toBeTrue();

    const exported = await caller.markPartnerSettlementBatchExported({
      batchId: "psb_1",
    });
    expect(exported.exported).toBeTrue();

    const paid = await caller.markPartnerSettlementBatchPaid({
      batchId: "psb_1",
    });
    expect(paid.paid).toBeTrue();

    const listed = await caller.listPartnerSettlementBatches();
    expect(listed.length).toBe(1);
  });
});
