import { describe, expect, test, mock } from "bun:test";
import { createCallerFactory } from "../trpc";
import { moduleRouter } from "./module";
import { plannerRouter } from "./planner";
import { typeRouter } from "./type";
import { catalogModuleWhere } from "@/server/util/module/catalog";

function fixture() {
  const moduleQueries: { where: unknown }[] = [];
  const findMany = mock(async (args: { where: unknown }) => {
    moduleQueries.push(args);
    return [];
  });
  const count = mock(async (args: { where: unknown }) => {
    moduleQueries.push(args);
    return 0;
  });
  const groupBy = mock(async (args: { where: unknown }) => {
    moduleQueries.push(args);
    return [];
  });
  const types = mock(async () => []);
  const db = {
    module: { findMany, count, groupBy },
    moduleType: { findMany: types, count: async () => 0 },
    tag: { findMany: async () => [], count: async () => 0 },
    tooltip: { count: async () => 0 },
    book: { count: async () => 0 },
  };
  const context = {
    db: db as never,
    session: {
      user: { id: "staff", role: "STAFF" },
      expires: "2099-01-01",
    } as never,
    headers: new Headers(),
  };
  return {
    moduleQueries,
    types,
    modules: createCallerFactory(moduleRouter)(context),
    planners: createCallerFactory(plannerRouter)(context),
    moduleTypes: createCallerFactory(typeRouter)(context),
  };
}

describe("panel module catalog", () => {
  test("filters before pagination and counting, including explicit private/catalog searches", async () => {
    const f = fixture();
    await f.modules.getAll({
      page: 2,
      limit: 12,
      search: "Notizen",
      visibility: "PRIVATE",
      origin: "CATALOG",
    });
    expect(f.moduleQueries).toHaveLength(2);
    for (const query of f.moduleQueries) {
      expect(query.where).toMatchObject({
        ...catalogModuleWhere,
        visible: "PRIVATE",
        createdById: null,
      });
    }
    expect(f.moduleQueries[0]).toMatchObject({ skip: 12, take: 12 });
  });

  test("uses the same catalog for module pickers and every insight bucket", async () => {
    const f = fixture();
    await f.modules.initPage();
    await f.modules.getInsights();
    expect(f.moduleQueries).toHaveLength(4);
    for (const query of f.moduleQueries)
      expect(query.where).toEqual(catalogModuleWhere);
    expect(f.types).toHaveBeenLastCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: { select: { modules: { where: catalogModuleWhere } } },
        }),
      }),
    );
  });

  test("keeps planner overview and type counts consistent with the catalog", async () => {
    const f = fixture();
    await f.planners.getOverview();
    expect(f.moduleQueries).toHaveLength(3);
    for (const query of f.moduleQueries)
      expect(query.where).toEqual(catalogModuleWhere);
    await f.moduleTypes.getAll();
    expect(f.types).toHaveBeenLastCalledWith(
      expect.objectContaining({
        include: {
          _count: { select: { modules: { where: catalogModuleWhere } } },
        },
      }),
    );
  });
});
