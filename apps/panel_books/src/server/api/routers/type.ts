import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";

export const typeRouter = createTRPCRouter({
  getById: protectedProcedure
    .input(
      z.object({
        typeId: z.string(),
      }),
    )
    .query(({ ctx, input }) => {
      return ctx.db.moduleType.findFirst({
        where: {
          id: input.typeId,
        },
      });
    }),
  getAll: publicProcedure.query(({ ctx }) => {
    return ctx.db.moduleType.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        _count: {
          select: { modules: { where: { deletedAt: null } } },
        },
      },
    });
  }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(40),
        minPages: z.number(),
        maxPages: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.moduleType.update({
        where: {
          id: input.id,
        },
        data: {
          name: input.name.toLocaleLowerCase(),
          minPages: input.minPages,
          maxPages: input.maxPages,
        },
      });
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(40),
        minPages: z.number(),
        maxPages: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.moduleType.create({
        data: {
          name: input.name.toLocaleLowerCase(),
          minPages: input.minPages,
          maxPages: input.maxPages,
        },
      });
    }),
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.id)
        throw new Error("Der angegebene Typ wurde nicht gefunden.");
      const existingType = await ctx.db.moduleType.findUnique({
        where: {
          id: input.id,
        },
        include: {
          _count: {
            select: { modules: { where: { deletedAt: null } } },
          },
        },
      });

      const moduleCount = existingType?._count?.modules ?? 0;

      if (moduleCount !== 0) {
        throw new Error(
          "Typen denen Module zugeordnet sind können nicht gelöscht werden.",
        );
      }

      return ctx.db.moduleType.update({
        where: {
          id: input.id,
        },
        data: {
          deletedAt: new Date(),
        },
      });
    }),
});
