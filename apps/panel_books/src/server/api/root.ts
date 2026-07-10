import { moduleRouter } from "./routers/module";
import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { pluginRouter } from "./routers/plugin";
import { tagRouter } from "./routers/tag";
import { typeRouter } from "./routers/type";
import { tipRouter } from "./routers/tip";
import { shopOrderRouter } from "./routers/shop-order";
import { customerRouter } from "./routers/customer";
import { couponRouter } from "./routers/coupon";
import { fulfillmentRouter } from "./routers/fulfillment";
import { plannerRouter } from "./routers/planner";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  module: moduleRouter,
  plugin: pluginRouter,
  type: typeRouter,
  tag: tagRouter,
  tip: tipRouter,
  shopOrder: shopOrderRouter,
  customer: customerRouter,
  coupon: couponRouter,
  fulfillment: fulfillmentRouter,
  planner: plannerRouter,
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
