import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { tipRouter } from "./routers/tip";
import { bookRouter } from "./routers/book";
import { moduleRouter } from "./routers/module";
import { configRouter } from "./routers/config";
import { typeRouter } from "./routers/type";
import { orderRouter } from "./routers/order";
import { userRouter } from "./routers/user";
import { partnerRouter } from "./routers/partner";
import { templateShareRouter } from "./routers/template-share";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */

export const appRouter = createTRPCRouter({
  module: moduleRouter,
  book: bookRouter,
  type: typeRouter,
  tip: tipRouter,
  order: orderRouter,
  config: configRouter,
  user: userRouter,
  partner: partnerRouter,
  templateShare: templateShareRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
