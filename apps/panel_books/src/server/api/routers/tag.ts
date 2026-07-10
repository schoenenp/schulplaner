import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";

export const tagRouter = createTRPCRouter({
  getDetail: protectedProcedure.query(async ({ ctx }) => {
    const tags = await ctx.db.tag.findMany({
      where: {
        deletedAt: null,
      },
    });
    const varsOutput = {
      all: tags.length ?? 0,
      live: tags.filter((v) => v.status === "RELEASED").length,
    };
    return varsOutput;
  }),
  getAll: publicProcedure
    .input(
      z
        .object({
          includeDeleted: z.boolean(),
        })
        .optional(),
    )
    .query(({ ctx, input }) => {
      return ctx.db.tag.findMany({
        where: input?.includeDeleted
          ? undefined
          : {
              deletedAt: null,
            },
        orderBy: {
          createdAt: "desc",
        },
      });
    }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(40),
        type: z.enum(["CONFIG", "FUNCTION", "DEFAULT"]),
        desc: z.string(),
        output: z.string(),
        status: z.enum(["RELEASED", "UNRELEASED", "BETA"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.tag.create({
        data: {
          name: input.name,
          type: input.type ?? "DEFAULT",
          desc: input.desc,
          output: input.output ?? "//",
          status: input.status ?? "UNRELEASED",
        },
      });
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(40),
        type: z.enum(["CONFIG", "FUNCTION", "DEFAULT"]),
        desc: z.string(),
        output: z.string(),
        status: z.enum(["RELEASED", "UNRELEASED", "BETA"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.tag.update({
        where: {
          id: input.id,
        },
        data: {
          name: input.name,
          type: input.type,
          desc: input.desc,
          output: input.output,
          status: input.status,
        },
      });
    }),
  softDelete: protectedProcedure
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tag = await ctx.db.tag.findUnique({
        where: {
          id: input.id,
        },
      });
      if (!tag || tag.deletedAt) {
        throw new Error("Die angegebene Variable wurde nicht gefunden.");
      }
      return ctx.db.tag.update({
        where: {
          id: input.id,
        },
        data: {
          deletedAt: new Date(),
        },
      });
    }),
  restore: protectedProcedure
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tag = await ctx.db.tag.findUnique({
        where: {
          id: input.id,
        },
      });
      if (!tag?.deletedAt) {
        throw new Error("Keine gelöschte Variable mit dieser ID gefunden.");
      }
      return ctx.db.tag.update({
        where: {
          id: input.id,
        },
        data: {
          deletedAt: null,
        },
      });
    }),
  hardDelete: protectedProcedure
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tag = await ctx.db.tag.findUnique({
        where: {
          id: input.id,
        },
      });
      if (!tag?.deletedAt) {
        throw new Error(
          "Nur bereits gelöschte Variablen können endgültig entfernt werden.",
        );
      }
      return ctx.db.tag.delete({
        where: {
          id: input.id,
        },
      });
    }),
});
