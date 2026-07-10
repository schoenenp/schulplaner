import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { protectedProcedure, createTRPCRouter } from "@/server/api/trpc";
import { enforceProcedureRateLimit } from "@/server/util/rate-limit";
import { logger } from "@/server/util/logger";
import { createPartnerSchoolInvoice } from "@/server/util/partner/invoices";
import { isPartnerControlledFulfillmentEnabled } from "@/server/util/partner/flags";
import {
  canTransitionPartnerOrderStatus,
  createPartnerCorrelationId,
  recordPartnerOrderTransition,
} from "@/server/util/partner/transitions";
import {
  asJsonObject,
  buildAdminAdjustedLineItemsSnapshot,
  buildSettlementSummary,
  readSettlementAmountsFromLineItems,
  resolveSettlementCycleWindow,
} from "@/server/util/partner/settlement";

const PARTNER_ORDER_STATUS = z.enum([
  "SUBMITTED_BY_SCHOOL",
  "UNDER_PARTNER_REVIEW",
  "PARTNER_CONFIRMED",
  "PARTNER_DECLINED",
  "RELEASED_TO_PRODUCTION",
  "FULFILLED",
]);

export const fulfillmentRouter = createTRPCRouter({
  getQueueCount: protectedProcedure.query(({ ctx }) =>
    ctx.db.partnerOrder.count({
      where: {
        status: { in: ["SUBMITTED_BY_SCHOOL", "UNDER_PARTNER_REVIEW"] },
      },
    }),
  ),

  listPartnerOrders: protectedProcedure
    .input(
      z
        .object({
          statuses: PARTNER_ORDER_STATUS.array().optional(),
          partnerUserId: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const statuses =
        input?.statuses && input.statuses.length > 0
          ? input.statuses
          : undefined;

      const orders = await ctx.db.partnerOrder.findMany({
        where: {
          ...(statuses ? { status: { in: statuses } } : {}),
          ...(input?.partnerUserId
            ? { partnerUserId: input.partnerUserId }
            : {}),
        },
        orderBy: {
          submittedAt: "desc",
        },
        include: {
          partnerUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          schoolUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          book: {
            select: {
              id: true,
              name: true,
            },
          },
          order: {
            select: {
              id: true,
              status: true,
              orderKey: true,
            },
          },
        },
      });

      return orders.map((order) => {
        const totals = readSettlementAmountsFromLineItems(
          order.lineItemsSnapshot,
        );
        const pricing = asJsonObject(
          order.lineItemsSnapshot,
        ).adminSettlementAdjustment;

        return {
          id: order.id,
          status: order.status,
          submittedAt: order.submittedAt,
          reviewedAt: order.reviewedAt,
          declineReason: order.declineReason,
          releasedAt: order.releasedAt,
          fulfilledAt: order.fulfilledAt,
          partnerUser: order.partnerUser,
          schoolUser: order.schoolUser,
          book: order.book,
          order: order.order,
          totals: {
            baseTotalAmount: totals.baseTotalAmount,
            addOnTotalAmount: totals.addOnTotalAmount,
            grandTotalAmount: totals.baseTotalAmount + totals.addOnTotalAmount,
          },
          adminSettlementAdjustment:
            pricing && typeof pricing === "object" ? pricing : null,
        };
      });
    }),

  adjustAmount: protectedProcedure
    .input(
      z.object({
        partnerOrderId: z.string(),
        reason: z.string().trim().min(3).max(500),
        adjustment: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("FIXED"),
            amountCents: z.number().int().min(0),
          }),
          z.object({
            type: z.literal("PERCENT_DISCOUNT"),
            percent: z.number().min(0).max(100),
          }),
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "fulfillment.adjustAmount",
        maxRequests: 50,
        windowMs: 10 * 60 * 1000,
      });

      const partnerOrder = await ctx.db.partnerOrder.findUnique({
        where: { id: input.partnerOrderId },
        select: {
          id: true,
          status: true,
          updatedAt: true,
          lineItemsSnapshot: true,
          partnerSnapshot: true,
        },
      });

      if (!partnerOrder) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Partner-Bestellung nicht gefunden.",
        });
      }

      if (
        partnerOrder.status !== "SUBMITTED_BY_SCHOOL" &&
        partnerOrder.status !== "UNDER_PARTNER_REVIEW"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Betragsanpassung ist nur vor der Partner-Bestaetigung moeglich.",
        });
      }

      const nextLineItemsSnapshot = buildAdminAdjustedLineItemsSnapshot({
        lineItemsSnapshot: partnerOrder.lineItemsSnapshot,
        adjustment: input.adjustment,
        reason: input.reason,
        adjustedByUserId: ctx.session.user.id,
      });

      const currentPartnerSnapshot = asJsonObject(partnerOrder.partnerSnapshot);
      const nextPartnerSnapshot = {
        ...currentPartnerSnapshot,
        adminSettlementAdjustment:
          nextLineItemsSnapshot.adminSettlementAdjustment,
      };

      const updated = await ctx.db.partnerOrder.updateMany({
        where: {
          id: partnerOrder.id,
          status: partnerOrder.status,
          updatedAt: partnerOrder.updatedAt,
        },
        data: {
          lineItemsSnapshot: nextLineItemsSnapshot,
          partnerSnapshot: nextPartnerSnapshot,
        },
      });

      if (updated.count !== 1) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Partner-Bestellung wurde zwischenzeitlich geaendert. Bitte neu laden.",
        });
      }

      const correlationId = createPartnerCorrelationId("partner_adjust_amount");
      await recordPartnerOrderTransition({
        db: ctx.db,
        partnerOrderId: partnerOrder.id,
        actorUserId: ctx.session.user.id,
        fromStatus: partnerOrder.status,
        toStatus: partnerOrder.status,
        correlationId,
        payload: {
          reason: input.reason,
          adjustment: input.adjustment,
          adminSettlementAdjustment:
            nextLineItemsSnapshot.adminSettlementAdjustment,
        },
      });

      return {
        adjusted: true,
        adminSettlementAdjustment:
          nextLineItemsSnapshot.adminSettlementAdjustment,
      };
    }),

  confirmPartnerOrder: protectedProcedure
    .input(
      z.object({
        partnerOrderId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "fulfillment.confirmPartnerOrder",
        maxRequests: 20,
        windowMs: 10 * 60 * 1000,
      });

      const partnerOrder = await ctx.db.partnerOrder.findFirst({
        where: {
          id: input.partnerOrderId,
          status: {
            in: ["SUBMITTED_BY_SCHOOL", "UNDER_PARTNER_REVIEW"],
          },
        },
        include: {
          order: {
            select: {
              orderKey: true,
            },
          },
          partnerUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!partnerOrder) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Partner-Bestellung konnte nicht bestaetigt werden.",
        });
      }
      if (
        !canTransitionPartnerOrderStatus(
          partnerOrder.status,
          "PARTNER_CONFIRMED",
        )
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Ungueltiger Statuswechsel fuer Partner-Bestellung.",
        });
      }

      const correlationId = createPartnerCorrelationId("partner_admin_confirm");
      let schoolInvoice: Awaited<ReturnType<typeof createPartnerSchoolInvoice>>;
      try {
        schoolInvoice = await createPartnerSchoolInvoice({
          partnerOrderId: partnerOrder.id,
          partnerUserId: partnerOrder.partnerUser.id,
          partnerName: partnerOrder.partnerUser.name ?? "Partner",
          partnerEmail: partnerOrder.partnerUser.email ?? null,
          schoolSnapshot: partnerOrder.schoolSnapshot,
          lineItemsSnapshot: partnerOrder.lineItemsSnapshot,
          orderKey: partnerOrder.order?.orderKey ?? null,
        });
      } catch (error) {
        logger.error("partner_school_invoice_create_failed", {
          partnerOrderId: partnerOrder.id,
          actorUserId: ctx.session.user.id,
          correlationId,
          error,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Schulrechnung konnte nicht erstellt werden.",
        });
      }

      const updated = await ctx.db.partnerOrder.updateMany({
        where: {
          id: partnerOrder.id,
          status: partnerOrder.status,
          updatedAt: partnerOrder.updatedAt,
        },
        data: {
          status: "PARTNER_CONFIRMED",
          reviewedAt: new Date(),
          reviewedByUserId: ctx.session.user.id,
          partnerSnapshot: {
            ...asJsonObject(partnerOrder.partnerSnapshot),
            partnerUserId: partnerOrder.partnerUser.id,
            partnerName: partnerOrder.partnerUser.name,
            partnerEmail: partnerOrder.partnerUser.email,
            confirmedAt: new Date().toISOString(),
            confirmedByPlatformUserId: ctx.session.user.id,
            invoiceIssuer: schoolInvoice.issuerSnapshot,
            schoolInvoice: {
              invoiceId: schoolInvoice.invoiceId,
              hostedInvoiceUrl: schoolInvoice.hostedInvoiceUrl,
              issuedAt: schoolInvoice.issuedAt,
            },
          },
        },
      });

      if (updated.count !== 1) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Partner-Bestellung wurde zwischenzeitlich geaendert. Bitte Ansicht aktualisieren.",
        });
      }

      await recordPartnerOrderTransition({
        db: ctx.db,
        partnerOrderId: partnerOrder.id,
        actorUserId: ctx.session.user.id,
        fromStatus: partnerOrder.status,
        toStatus: "PARTNER_CONFIRMED",
        correlationId,
        payload: {
          schoolInvoiceId: schoolInvoice.invoiceId,
          hostedInvoiceUrl: schoolInvoice.hostedInvoiceUrl,
          invoiceIssuer: schoolInvoice.issuerSnapshot,
          confirmedByPlatformUserId: ctx.session.user.id,
        },
      });

      return { confirmed: true };
    }),

  releasePartnerOrder: protectedProcedure
    .input(
      z.object({
        partnerOrderId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "fulfillment.releasePartnerOrder",
        maxRequests: 20,
        windowMs: 10 * 60 * 1000,
      });

      if (!isPartnerControlledFulfillmentEnabled()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Partner review flow is currently disabled.",
        });
      }

      const partnerOrder = await ctx.db.partnerOrder.findFirst({
        where: {
          id: input.partnerOrderId,
        },
        include: {
          order: {
            select: {
              id: true,
              orderKey: true,
            },
          },
          book: {
            select: {
              id: true,
              name: true,
            },
          },
          schoolUser: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      if (!partnerOrder) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Partner-Bestellung nicht gefunden.",
        });
      }

      if (
        partnerOrder.status === "RELEASED_TO_PRODUCTION" ||
        partnerOrder.status === "FULFILLED"
      ) {
        return { released: true, alreadyReleased: true };
      }

      if (partnerOrder.status !== "PARTNER_CONFIRMED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bestellung muss zuerst bestaetigt werden.",
        });
      }

      if (!partnerOrder.order?.orderKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bestellung ist noch nicht fuer die Produktion vorbereitet.",
        });
      }

      const correlationId = createPartnerCorrelationId("partner_admin_release");
      const releaseAt = new Date();
      const releaseTransition = await ctx.db.partnerOrder.updateMany({
        where: {
          id: partnerOrder.id,
          status: "PARTNER_CONFIRMED",
        },
        data: {
          status: "RELEASED_TO_PRODUCTION",
          releasedAt: releaseAt,
        },
      });

      if (releaseTransition.count !== 1) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Partner-Bestellung konnte nicht freigegeben werden.",
        });
      }

      await recordPartnerOrderTransition({
        db: ctx.db,
        partnerOrderId: partnerOrder.id,
        actorUserId: ctx.session.user.id,
        fromStatus: "PARTNER_CONFIRMED",
        toStatus: "RELEASED_TO_PRODUCTION",
        correlationId,
        payload: {
          orderKey: partnerOrder.order.orderKey,
          releasedByPlatformUserId: ctx.session.user.id,
        },
      });

      await ctx.db.partnerNotification.create({
        data: {
          partnerUserId: partnerOrder.partnerUserId,
          partnerOrderId: partnerOrder.id,
          type: "PARTNER_ORDER_RELEASED",
          payload: {
            orderKey: partnerOrder.order.orderKey,
            bookId: partnerOrder.book.id,
            bookName: partnerOrder.book.name,
            releasedByPlatformUserId: ctx.session.user.id,
          },
        },
      });

      return { released: true, orderKey: partnerOrder.order.orderKey };
    }),

  getSalesOverview: protectedProcedure
    .input(
      z
        .object({
          cycleYear: z.number().int().min(2024).max(2100).optional(),
          cycleMonth: z.number().int().min(1).max(12).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const { cycleYear, cycleMonth, cycleStart, cycleEnd } =
        resolveSettlementCycleWindow(input);

      const orders = await ctx.db.partnerOrder.findMany({
        where: {
          submittedAt: {
            gte: cycleStart,
            lt: cycleEnd,
          },
        },
        select: {
          id: true,
          partnerUserId: true,
          status: true,
          lineItemsSnapshot: true,
        },
      });

      const totals = buildSettlementSummary(orders);
      const byStatus = orders.reduce(
        (acc, order) => {
          acc[order.status] = (acc[order.status] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      const partnerOrderCount = orders.reduce((acc, order) => {
        acc.set(order.partnerUserId, (acc.get(order.partnerUserId) ?? 0) + 1);
        return acc;
      }, new Map<string, number>());

      const partnerIds = Array.from(partnerOrderCount.keys());
      const partners = await ctx.db.user.findMany({
        where: { id: { in: partnerIds } },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });
      const partnerMap = new Map(partners.map((entry) => [entry.id, entry]));

      const topPartners = Array.from(partnerOrderCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([partnerUserId, orderCount]) => ({
          partnerUserId,
          orderCount,
          partner: partnerMap.get(partnerUserId) ?? null,
        }));

      const adjustedOrderCount = orders.filter((order) => {
        const adjustment = asJsonObject(
          order.lineItemsSnapshot,
        ).adminSettlementAdjustment;
        return Boolean(adjustment && typeof adjustment === "object");
      }).length;

      return {
        cycleYear,
        cycleMonth,
        cycleStart,
        cycleEnd,
        orderCount: orders.length,
        adjustedOrderCount,
        totals,
        byStatus,
        topPartners,
      };
    }),
});
