import {
  createTRPCRouter,
  publicProcedure,
} from "@/server/api/trpc";

export const typeRouter = createTRPCRouter({
   getCustomTypes: publicProcedure
  .query(async ({ctx}) => {
    const {db} = ctx
    const foundModules = await db.moduleType.findMany({
        where:{
            name:{
                in:["umschlag", "wochenplaner", "sonstige"]
            },
            deletedAt: null,
          }
        })

        return foundModules?.map(fm => ({
          id:   fm.id,
          max:  fm.maxPages,
          min:  fm.minPages,
          name: fm.name,
        }))
    }),
  });

