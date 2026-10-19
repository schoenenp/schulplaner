import { expect, test } from "bun:test";
import { PrismaClient } from "db";
import { createCallerFactory } from "../trpc";
import { bookRouter } from "./book";
import { configRouter } from "./config";

const testUrl = process.env.DRAFT_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    !/^\/draft_quantity_test_[a-z0-9_]+$/.test(url.pathname)
  ) {
    throw new Error(
      "Draft tests require a disposable loopback draft_quantity_test_* database",
    );
  }
}

(testUrl ? test : test.skip)(
  "persists quantity across real database saves and configuration reloads",
  async () => {
    const db = new PrismaClient({ datasourceUrl: testUrl });
    const user = await db.user.create({
      data: { name: "Quantity regression" },
    });
    const book = await db.book.create({
      data: { name: "Quantity draft", createdById: user.id },
    });
    try {
      expect(book.quantity).toBe(1);
      const context = {
        db: db as never,
        session: {
          user: { id: user.id, role: "USER" },
          expires: "2099-01-01",
        } as never,
        headers: new Headers(),
        config: { id: "draft-test" },
      };
      const books = createCallerFactory(bookRouter)(context);
      await books.saveBookModules({
        bookId: book.id,
        quantity: 500,
        modules: [],
      });
      expect(
        (await db.book.findUniqueOrThrow({ where: { id: book.id } })).quantity,
      ).toBe(500);
      const config = await createCallerFactory(configRouter)(context).init({
        bookId: book.id,
      });
      expect(config?.book?.quantity).toBe(500);
      await books.saveBookModules({ bookId: book.id, modules: [] });
      expect(
        (await db.book.findUniqueOrThrow({ where: { id: book.id } })).quantity,
      ).toBe(500);
    } finally {
      await db.book.delete({ where: { id: book.id } });
      await db.user.delete({ where: { id: user.id } });
      await db.$disconnect();
    }
  },
);
