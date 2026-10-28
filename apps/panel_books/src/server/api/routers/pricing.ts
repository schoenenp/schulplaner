import { TRPCError } from "@trpc/server";
import { priceBookSchema } from "pricing";
import {
  PriceBookConflictError,
  PriceBookUnchangedError,
  type PriceBookActor,
} from "pricing/store";
import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { getPriceStore } from "@/server/pricing";
import { logger } from "@/server/util/logger";

function actorOf(user: {
  id: string;
  name?: string | null;
  email?: string | null;
}): PriceBookActor {
  return { id: user.id, name: user.name ?? user.email ?? null };
}

function rethrowStoreError(error: unknown): never {
  if (error instanceof PriceBookConflictError) {
    throw new TRPCError({ code: "CONFLICT", message: error.message });
  }
  if (error instanceof PriceBookUnchangedError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  throw error;
}

export const pricingRouter = createTRPCRouter({
  get: adminProcedure.query(async () => {
    const store = await getPriceStore();
    return store.overview(30);
  }),

  save: adminProcedure
    .input(
      z.object({
        baseVersionId: z.number().int().positive(),
        note: z.string().trim().max(500).optional(),
        priceBook: priceBookSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const store = await getPriceStore();
        const version = await store.save({
          ...input,
          actor: actorOf(ctx.session.user),
        });
        logger.info("pricing_saved", {
          versionId: version.id,
          actorUserId: ctx.session.user.id,
        });
        return version;
      } catch (error) {
        rethrowStoreError(error);
      }
    }),

  restore: adminProcedure
    .input(
      z.object({
        versionId: z.number().int().positive(),
        baseVersionId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const store = await getPriceStore();
        const version = await store.restore({
          ...input,
          actor: actorOf(ctx.session.user),
        });
        logger.info("pricing_restored", {
          versionId: version.id,
          restoredFromId: input.versionId,
          actorUserId: ctx.session.user.id,
        });
        return version;
      } catch (error) {
        rethrowStoreError(error);
      }
    }),
});
