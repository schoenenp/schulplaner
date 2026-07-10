import fs from "fs";
import path from "path";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const pluginRouter = createTRPCRouter({
  getAll: protectedProcedure.query(() => {
    const pluginsDir = path.join(
      process.cwd(),
      "src",
      "app",
      "dashboard",
      "_plugins",
    );
    const componentNames: string[] = fs
      .readdirSync(pluginsDir)
      .filter((file) => file.endsWith(".tsx"))
      .map((file) => file.replace(".tsx", ""));

    return componentNames;
  }),
});
