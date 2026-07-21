import type { Prisma } from "db";

export function buildModuleFeedVisibilityWhere(
  userId?: string,
): Prisma.ModuleWhereInput {
  return {
    OR: [{ visible: "PUBLIC" }, ...(userId ? [{ createdById: userId }] : [])],
  };
}

export function buildModulePreviewVisibilityWhere(
  userId?: string,
): Prisma.ModuleWhereInput {
  return {
    OR: [
      { visible: { in: ["PUBLIC", "SHARED"] } },
      ...(userId ? [{ createdById: userId }] : []),
    ],
  };
}
