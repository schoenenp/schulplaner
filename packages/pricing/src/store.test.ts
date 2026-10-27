import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_PRICE_BOOK } from "./price-book";
import {
  createPriceStore,
  openPriceStore,
  openSqliteDatabase,
  PriceBookConflictError,
  PriceBookUnchangedError,
  SEED_NOTE,
} from "./store";

const admin = { id: "user_admin", name: "Admin" };
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function memoryStore() {
  let tick = 0;
  return createPriceStore(openSqliteDatabase(":memory:"), {
    now: () => new Date(Date.UTC(2026, 9, 27, 12, 0, tick++)),
  });
}

function withColor(singleCents: number) {
  return {
    ...DEFAULT_PRICE_BOOK,
    sheets: {
      ...DEFAULT_PRICE_BOOK.sheets,
      color: { ...DEFAULT_PRICE_BOOK.sheets.color, singleCents },
    },
  };
}

describe("price store", () => {
  it("seeds the former hard-coded prices as version 1", () => {
    const store = memoryStore();
    expect(store.initialized).toBe(true);
    const current = store.current();
    expect(current.id).toBe(1);
    expect(current.priceBook).toEqual(DEFAULT_PRICE_BOOK);
    expect(current.note).toBe(SEED_NOTE);
    expect(current.createdById).toBeNull();
  });

  it("stores each save as a new version and keeps the history", () => {
    const store = memoryStore();
    const saved = store.save({
      priceBook: withColor(18),
      baseVersionId: 1,
      note: "  Papierpreise gestiegen  ",
      actor: admin,
    });
    expect(saved.id).toBe(2);
    expect(saved.note).toBe("Papierpreise gestiegen");
    expect(saved.createdById).toBe("user_admin");
    expect(store.current().priceBook.sheets.color.singleCents).toBe(18);
    expect(store.history().map((version) => version.id)).toEqual([2, 1]);
  });

  it("rejects a save based on an outdated version", () => {
    const store = memoryStore();
    store.save({ priceBook: withColor(18), baseVersionId: 1, actor: admin });
    expect(() =>
      store.save({ priceBook: withColor(20), baseVersionId: 1, actor: admin }),
    ).toThrow(PriceBookConflictError);
    expect(store.current().priceBook.sheets.color.singleCents).toBe(18);
  });

  it("rejects saves without changes and invalid prices", () => {
    const store = memoryStore();
    expect(() =>
      store.save({ priceBook: DEFAULT_PRICE_BOOK, baseVersionId: 1, actor: admin }),
    ).toThrow(PriceBookUnchangedError);
    expect(() =>
      store.save({ priceBook: withColor(-1), baseVersionId: 1, actor: admin }),
    ).toThrow();
    expect(store.history()).toHaveLength(1);
  });

  it("restores an earlier version as a new version", () => {
    const store = memoryStore();
    store.save({ priceBook: withColor(18), baseVersionId: 1, actor: admin });
    const restored = store.restore({ versionId: 1, baseVersionId: 2, actor: admin });
    expect(restored.id).toBe(3);
    expect(restored.restoredFromId).toBe(1);
    expect(restored.priceBook).toEqual(DEFAULT_PRICE_BOOK);
    expect(() =>
      store.restore({ versionId: 99, baseVersionId: 3, actor: admin }),
    ).toThrow("Diese Preisversion gibt es nicht.");
  });

  it("keeps prices across reopening the database file", () => {
    const dir = mkdtempSync(join(tmpdir(), "pricing-store-"));
    tempDirs.push(dir);
    const path = join(dir, "nested", "pricing.sqlite");

    const first = openPriceStore(path);
    first.save({ priceBook: withColor(21), baseVersionId: 1, actor: admin });
    const createdAt = first.createdAt();
    first.close();

    const reopened = openPriceStore(path);
    expect(reopened.initialized).toBe(false);
    expect(reopened.current().id).toBe(2);
    expect(reopened.current().priceBook.sheets.color.singleCents).toBe(21);
    expect(reopened.createdAt()).toBe(createdAt);
    reopened.close();
  });

  it("refuses a database written by a newer schema", () => {
    const db = openSqliteDatabase(":memory:");
    db.exec("PRAGMA user_version = 99");
    expect(() => createPriceStore(db)).toThrow("neueren Version");
  });
});
