import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "db";

import { protectedProcedure, createTRPCRouter } from "@/server/api/trpc";
import { enforceProcedureRateLimit } from "@/server/util/rate-limit";

const USER_ROLE = z.enum([
  "ADMIN",
  "STAFF",
  "MODERATOR",
  "USER",
  "SPONSOR",
  "PARTNER",
]);

const listInput = z.object({
  query: z.string().trim().max(120).optional(),
  role: USER_ROLE.optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(20),
});

function buildUserWhere(input: z.infer<typeof listInput>): Prisma.UserWhereInput {
  const query = input.query && input.query.length > 0 ? input.query : undefined;

  return {
    ...(input.role ? { role: input.role } : {}),
    ...(query
      ? {
          OR: [
            { email: { contains: query } },
            { name: { contains: query } },
            { id: query },
          ],
        }
      : {}),
  };
}

export const customerRouter = createTRPCRouter({
  getOverview: protectedProcedure.query(async ({ ctx }) => {
    const monthStart = new Date();
    monthStart.setUTCDate(monthStart.getUTCDate() - 30);

    const [roleBuckets, totalUsers, verifiedLast30Days] = await Promise.all([
      ctx.db.user.groupBy({
        by: ["role"],
        _count: { _all: true },
      }),
      ctx.db.user.count(),
      ctx.db.user.count({
        where: { emailVerified: { gte: monthStart } },
      }),
    ]);

    const roleCounts = roleBuckets.reduce(
      (acc, entry) => {
        acc[entry.role] = entry._count._all;
        return acc;
      },
      {} as Record<string, number>,
    );

    return { totalUsers, roleCounts, verifiedLast30Days };
  }),

  getAll: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const where = buildUserWhere(input);

    const [total, users] = await Promise.all([
      ctx.db.user.count({ where }),
      ctx.db.user.findMany({
        where,
        orderBy: { email: "asc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          emailVerified: true,
          _count: {
            select: {
              books: true,
              orders: true,
              modules: true,
              partnerOrdersAsPartner: true,
            },
          },
        },
      }),
    ]);

    const campaignCounts = await ctx.db.campaign.groupBy({
      by: ["partnerUserId"],
      where: { partnerUserId: { in: users.map((user) => user.id) } },
      _count: { _all: true },
    });
    const campaignsByPartner = new Map(
      campaignCounts.map((entry) => [entry.partnerUserId, entry._count._all]),
    );

    return {
      items: users.map((user) => ({
        ...user,
        campaignCount: campaignsByPartner.get(user.id) ?? 0,
      })),
      total,
      page: input.page,
      pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
    };
  }),

  getById: protectedProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          emailVerified: true,
          image: true,
          accounts: { select: { provider: true } },
          _count: {
            select: {
              books: true,
              orders: true,
              modules: true,
              partnerOrdersAsPartner: true,
              partnerOrdersAsSchool: true,
              templateSharesCreated: true,
            },
          },
          orders: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: {
              id: true,
              orderKey: true,
              status: true,
              createdAt: true,
              bookOrder: {
                select: {
                  quantity: true,
                  book: { select: { id: true, name: true } },
                  payment: {
                    select: { total: true, currency: true, status: true },
                  },
                },
              },
            },
          },
          books: {
            where: { deletedAt: null },
            orderBy: { updatedAt: "desc" },
            take: 10,
            select: {
              id: true,
              name: true,
              isTemplate: true,
              isFeatured: true,
              updatedAt: true,
            },
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Benutzer nicht gefunden.",
        });
      }

      const campaignCount = await ctx.db.campaign.count({
        where: { partnerUserId: user.id },
      });

      return { ...user, campaignCount };
    }),

  setRole: protectedProcedure
    .input(z.object({ userId: z.string().min(1), role: USER_ROLE }))
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "customer.setRole",
        maxRequests: 25,
        windowMs: 10 * 60 * 1000,
      });

      const actor = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { id: true, role: true },
      });
      if (!actor) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      if (actor.role !== "ADMIN" && input.role === "ADMIN") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Nur Admin darf die Rolle ADMIN vergeben.",
        });
      }

      const target = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: { id: true, role: true },
      });
      if (!target) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Benutzer nicht gefunden.",
        });
      }

      if (actor.role !== "ADMIN" && target.role === "ADMIN") {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Nur Admin darf andere Admin-Rollen aendern.",
        });
      }

      if (target.id === actor.id && input.role !== actor.role) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Die eigene Rolle kann nicht geaendert werden.",
        });
      }

      return ctx.db.user.update({
        where: { id: input.userId },
        data: { role: input.role },
        select: { id: true, role: true },
      });
    }),
});
