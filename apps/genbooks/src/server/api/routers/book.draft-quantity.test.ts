/* eslint-disable @typescript-eslint/await-thenable -- Bun rejection matchers are asynchronous. */
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useModuleState } from "@/hooks/use-module-state";
import { createCallerFactory } from "../trpc";
import { bookRouter } from "./book";
import { configRouter } from "./config";

function fixture(userId = "owner") {
  let book = {
    id: "draft",
    createdById: "owner",
    isTemplate: false,
    isPublic: false,
    deletedAt: null,
    sourceType: "STANDARD",
    quantity: 1,
    name: "School planner",
    modules: [],
    contentGroups: [],
    customDates: [],
  };
  const db = {
    book: {
      findUnique: async () => book,
      findUniqueOrThrow: async () => book,
      findFirst: async () => book,
      update: async ({ data }: { data: { quantity?: number } }) => {
        if (data.quantity !== undefined)
          book = { ...book, quantity: data.quantity };
        return book;
      },
    },
    bookModule: { deleteMany: async () => ({ count: 0 }) },
    bookContentGroup: {
      count: async () => 0,
      deleteMany: async () => ({ count: 0 }),
    },
    module: { findMany: async () => [] },
    moduleGroup: { findMany: async () => [] },
    moduleType: { findMany: async () => [] },
    tooltip: { findMany: async () => [] },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  };
  const context = {
    db: db as never,
    session: {
      user: { id: userId, role: "USER" },
      expires: "2099-01-01",
    } as never,
    headers: new Headers(),
    config: { id: "draft-test" },
  };
  return {
    books: createCallerFactory(bookRouter)(context),
    config: createCallerFactory(configRouter)(context),
    getBook: () => book,
  };
}

function QuantityInput({ quantity }: { quantity?: number }) {
  const { orderAmount } = useModuleState({ quantity });
  return createElement("input", {
    type: "number",
    value: orderAmount,
    readOnly: true,
  });
}

describe("draft quantity", () => {
  test("save 500, reopen the configuration, and initialize Stückzahl with 500", async () => {
    const f = fixture();
    await f.books.saveBookModules({
      bookId: "draft",
      quantity: 500,
      modules: [],
    });
    const reloaded = await f.config.init({ bookId: "draft" });
    expect(reloaded?.book?.quantity).toBe(500);
    expect(
      renderToStaticMarkup(
        createElement(QuantityInput, { quantity: reloaded?.book?.quantity }),
      ),
    ).toContain('value="500"');
    // Older clients may still save module selections without sending quantity.
    await f.books.saveBookModules({ bookId: "draft", modules: [] });
    expect(f.getBook().quantity).toBe(500);
  });

  test("new or legacy configurations initialize with one copy", () => {
    expect(renderToStaticMarkup(createElement(QuantityInput, {}))).toContain(
      'value="1"',
    );
  });

  test.each([0, -1, 1.5, 5001])(
    "rejects invalid draft quantity %s without changing the saved draft",
    async (quantity) => {
      const f = fixture();
      await expect(
        f.books.saveBookModules({ bookId: "draft", quantity, modules: [] }),
      ).rejects.toThrow();
      expect(f.getBook().quantity).toBe(1);
    },
  );

  test("another user cannot change the saved quantity", async () => {
    const f = fixture("other-user");
    await expect(
      f.books.saveBookModules({ bookId: "draft", quantity: 500, modules: [] }),
    ).rejects.toThrow();
    expect(f.getBook().quantity).toBe(1);
  });
});
