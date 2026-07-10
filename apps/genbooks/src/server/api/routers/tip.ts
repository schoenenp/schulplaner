import { z } from "zod";

import {
  createTRPCRouter,
  publicProcedure,
} from "@/server/api/trpc";
import { logger } from "@/util/logger";

export const tipRouter = createTRPCRouter({
  hello: publicProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => {
      return {
        greeting: `Hello ${input.text}`,
      };
  }),
  getCurrent: publicProcedure
  .input(z.object({
    tips: z.string().array()
  }))
  .query(({ctx, input}) => {
    const {tips} = input
    const {db} = ctx
    logger.debug("tip_get_current", { requestedTipCount: tips.length })
    return db.tooltip.findMany({
  where: {
    title: {
      in: tips
    }
  }
})
  }),
});
