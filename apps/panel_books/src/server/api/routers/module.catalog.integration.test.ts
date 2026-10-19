import { expect, test } from "bun:test";
import { PrismaClient } from "db";
import { catalogModuleWhere } from "@/server/util/module/catalog";

// Opt-in only: the disposable database is created by the local verification
// harness. Never use the application DATABASE_URL for fixture writes.
const testUrl = process.env.CATALOG_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !/^\/module_catalog_test_[a-z0-9_]+$/.test(url.pathname)
  ) {
    throw new Error(
      "Catalog tests require a disposable loopback module_catalog_test_* database",
    );
  }
}

(testUrl ? test : test.skip)(
  "catalog excludes snapshot-only copies while preserving originals and uploads",
  async () => {
    const db = new PrismaClient({ datasourceUrl: testUrl });
    const rollback = new Error("Rollback catalog fixtures");
    try {
      await db.$transaction(
        async (tx) => {
          const type = await tx.moduleType.create({
            data: { name: "catalog regression" },
          });
          const user = await tx.user.create({ data: { name: "Catalog test" } });
          const source = await tx.book.create({
            data: { name: "Source planner" },
          });
          const snapshot = await tx.book.create({
            data: { name: "Submission snapshot", copyFromId: source.id },
          });
          const oldSnapshot = await tx.book.create({
            data: {
              name: "Archived snapshot",
              copyFromId: source.id,
              deletedAt: new Date(),
            },
          });
          const ownedCopy = await tx.book.create({
            data: {
              name: "Saved user copy",
              copyFromId: source.id,
              createdById: user.id,
            },
          });
          const template = await tx.book.create({
            data: {
              name: "Template copy",
              copyFromId: source.id,
              isTemplate: true,
            },
          });
          const fixtures = [
            {
              name: "Public original used in snapshot",
              visible: "PUBLIC" as const,
              books: [snapshot.id],
            },
            {
              name: "Shared original",
              visible: "SHARED" as const,
              books: [snapshot.id],
            },
            {
              name: "Unused private catalog draft",
              visible: "PRIVATE" as const,
              books: [],
            },
            {
              name: "User upload used in snapshot",
              visible: "PRIVATE" as const,
              books: [snapshot.id],
              createdById: user.id,
            },
            {
              name: "Private original reused in snapshot",
              visible: "PRIVATE" as const,
              books: [source.id, snapshot.id],
            },
            {
              name: "Private original in source planner",
              visible: "PRIVATE" as const,
              books: [source.id],
            },
            {
              name: "Private module in owned saved copy",
              visible: "PRIVATE" as const,
              books: [ownedCopy.id],
            },
            {
              name: "Private module in template copy",
              visible: "PRIVATE" as const,
              books: [template.id],
            },
            {
              name: "Snapshot-only duplicate",
              visible: "PRIVATE" as const,
              books: [snapshot.id],
              hidden: true,
            },
            {
              name: "Historical snapshot duplicate",
              visible: "PRIVATE" as const,
              books: [oldSnapshot.id],
              hidden: true,
            },
            {
              name: "Deleted catalog module",
              visible: "PUBLIC" as const,
              books: [],
              hidden: true,
              deletedAt: new Date(),
            },
          ];
          const expectedIds: string[] = [];
          const allIds: string[] = [];
          for (const fixture of fixtures) {
            const module = await tx.module.create({
              data: {
                name: fixture.name,
                typeId: type.id,
                visible: fixture.visible,
                createdById: fixture.createdById,
                deletedAt: fixture.deletedAt,
                books: { create: fixture.books.map((bookId) => ({ bookId })) },
              },
            });
            allIds.push(module.id);
            if (!fixture.hidden) expectedIds.push(module.id);
          }
          const where = { ...catalogModuleWhere, id: { in: allIds } };
          const actual = await tx.module.findMany({
            where,
            select: { id: true },
          });
          expect(actual.map((row) => row.id).sort()).toEqual(
            expectedIds.sort(),
          );
          expect(await tx.module.count({ where })).toBe(8);
          const privateModules = await tx.module.findMany({
            where: { ...where, visible: "PRIVATE" },
          });
          expect(privateModules).toHaveLength(6);
          // Excluding snapshots from staff discovery must not remove their data.
          expect(await tx.module.count({ where: { id: { in: allIds } } })).toBe(
            11,
          );
          throw rollback;
        },
        { timeout: 20000 },
      );
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      await db.$disconnect();
    }
  },
);
