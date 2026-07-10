import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";

export const tipRouter = createTRPCRouter({
  getById: publicProcedure
    .input(
      z.object({
        tipId: z.number(),
      }),
    )
    .query(({ ctx, input }) => {
      return ctx.db.tooltip.findUnique({
        where: {
          id: input.tipId,
        },
      });
    }),
  getAll: publicProcedure.query(({ ctx }) => {
    return ctx.db.tooltip.findMany({
      where: {
        deletedAt: null,
      },
    });
  }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        tip: z.string().min(1),
        title: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, tip, title } = input;
      return ctx.db.tooltip.update({
        where: {
          id,
        },
        data: {
          tip: tip.toLocaleLowerCase(),
          title,
        },
      });
    }),
  create: protectedProcedure
    .input(
      z.object({
        tip: z.string().min(1),
        title: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { tip, title } = input;
      return ctx.db.tooltip.create({
        data: {
          tip: tip.toLocaleLowerCase(),
          title,
        },
      });
    }),
  delete: protectedProcedure
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.tooltip.update({
        where: {
          id: input.id,
        },
        data: {
          deletedAt: new Date(),
        },
      });
    }),
});
