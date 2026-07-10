import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";

import { protectedProcedure, createTRPCRouter } from "@/server/api/trpc";
import { enforceProcedureRateLimit } from "@/server/util/rate-limit";

const ORDER_STATUS = z.enum([
  "PENDING",
  "COMPLETED",
  "SHIPPED",
  "CANCELED",
  "FAILED",
]);

const DELIVERY_STATUS = z.enum([
  "PENDING",
  "PREPARING",
  "SHIPPED",
  "COMPLETED",
  "RETOURING",
  "RETOURED",
]);

const listInput = z.object({
  query: z.string().trim().max(120).optional(),
  status: ORDER_STATUS.optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(20),
});

function buildOrderWhere(input: z.infer<typeof listInput>): Prisma.OrderWhereInput {
  const query = input.query && input.query.length > 0 ? input.query : undefined;

  return {
    deletedAt: null,
    ...(input.status ? { status: input.status } : {}),
    ...(query
      ? {
          OR: [
            { orderKey: { contains: query } },
            { user: { email: { contains: query } } },
            { user: { name: { contains: query } } },
            { bookOrder: { book: { name: { contains: query } } } },
          ],
        }
      : {}),
  };
}

export const shopOrderRouter = createTRPCRouter({
  getOverview: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );

    const [statusBuckets, monthRevenue, openShipments, monthOrders] =
      await Promise.all([
        ctx.db.order.groupBy({
          by: ["status"],
          where: { deletedAt: null },
          _count: { _all: true },
        }),
        ctx.db.payment.aggregate({
          _sum: { total: true },
          where: {
            status: "SUCCEEDED",
            bookOrder: {
              is: { order: { is: { createdAt: { gte: monthStart } } } },
            },
          },
        }),
        ctx.db.shipping.count({
          where: {
            deletedAt: null,
            status: { in: ["PENDING", "PREPARING"] },
            order: { isNot: null },
          },
        }),
        ctx.db.order.count({
          where: { deletedAt: null, createdAt: { gte: monthStart } },
        }),
      ]);

    const byStatus = statusBuckets.reduce(
      (acc, entry) => {
        acc[entry.status] = entry._count._all;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      totalOrders: statusBuckets.reduce(
        (acc, entry) => acc + entry._count._all,
        0,
      ),
      byStatus,
      monthOrders,
      monthRevenueCents: monthRevenue._sum.total ?? 0,
      openShipments,
    };
  }),

  getAll: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const where = buildOrderWhere(input);

    const [total, items] = await Promise.all([
      ctx.db.order.count({ where }),
      ctx.db.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        include: {
          user: { select: { id: true, name: true, email: true } },
          shipping: {
            select: { id: true, status: true, trackId: true, title: true },
          },
          partnerOrder: { select: { id: true, status: true } },
          bookOrder: {
            select: {
              quantity: true,
              book: { select: { id: true, name: true, bookTitle: true } },
              payment: {
                select: {
                  id: true,
                  status: true,
                  total: true,
                  currency: true,
                  refundedAt: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      items,
      total,
      page: input.page,
      pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
    };
  }),

  getById: protectedProcedure
    .input(z.object({ orderId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.order.findUnique({
        where: { id: input.orderId },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
          shipping: true,
          partnerOrder: {
            select: {
              id: true,
              status: true,
              partnerUser: { select: { id: true, name: true, email: true } },
            },
          },
          bookOrder: {
            include: {
              payment: true,
              book: {
                select: {
                  id: true,
                  name: true,
                  bookTitle: true,
                  subTitle: true,
                  format: true,
                  region: true,
                  planStart: true,
                  planEnd: true,
                  _count: { select: { modules: true, customDates: true } },
                },
              },
            },
          },
        },
      });

      if (!order || order.deletedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bestellung nicht gefunden.",
        });
      }

      return order;
    }),

  updateStatus: protectedProcedure
    .input(z.object({ orderId: z.number().int(), status: ORDER_STATUS }))
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "shopOrder.updateStatus",
        maxRequests: 60,
        windowMs: 10 * 60 * 1000,
      });

      const order = await ctx.db.order.findUnique({
        where: { id: input.orderId },
        select: { id: true, status: true, deletedAt: true },
      });
      if (!order || order.deletedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bestellung nicht gefunden.",
        });
      }
      if (order.status === input.status) {
        return { id: order.id, status: order.status };
      }

      const updated = await ctx.db.order.update({
        where: { id: order.id },
        data: {
          status: input.status,
          canceledAt:
            input.status === "CANCELED"
              ? new Date()
              : order.status === "CANCELED"
                ? null
                : undefined,
        },
        select: { id: true, status: true, canceledAt: true },
      });

      return updated;
    }),

  updateShipping: protectedProcedure
    .input(
      z.object({
        orderId: z.number().int(),
        status: DELIVERY_STATUS,
        trackId: z.string().trim().max(120).optional(),
        title: z.string().trim().max(120).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "shopOrder.updateShipping",
        maxRequests: 60,
        windowMs: 10 * 60 * 1000,
      });

      const order = await ctx.db.order.findUnique({
        where: { id: input.orderId },
        select: {
          id: true,
          deletedAt: true,
          shipping: { select: { id: true, shippedAt: true, retouredAt: true } },
        },
      });
      if (!order || order.deletedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bestellung nicht gefunden.",
        });
      }

      const timestamps = {
        shippedAt:
          input.status === "SHIPPED" && !order.shipping?.shippedAt
            ? new Date()
            : undefined,
        retouredAt:
          input.status === "RETOURED" && !order.shipping?.retouredAt
            ? new Date()
            : undefined,
      };

      if (order.shipping) {
        return ctx.db.shipping.update({
          where: { id: order.shipping.id },
          data: {
            status: input.status,
            ...(input.trackId !== undefined ? { trackId: input.trackId } : {}),
            ...(input.title !== undefined ? { title: input.title } : {}),
            ...timestamps,
          },
        });
      }

      const shipping = await ctx.db.shipping.create({
        data: {
          status: input.status,
          trackId: input.trackId,
          title: input.title,
          ...timestamps,
        },
      });
      await ctx.db.order.update({
        where: { id: order.id },
        data: { shippingId: shipping.id },
      });
      return shipping;
    }),
});
