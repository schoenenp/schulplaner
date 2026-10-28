import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { DEFAULT_PRICE_BOOK } from "./price-book";
import { createTestDatabase } from "./test-database";
import {
  openPriceStore,
  PriceBookConflictError,
  PriceBookUnchangedError,
  SEED_NOTE,
  type PriceStore,
  type PriceBookArchive,
} from "./store";

const admin = { id: "user_admin", name: "Admin" };
const withColor = (singleCents: number) => ({
  ...DEFAULT_PRICE_BOOK,
  sheets: {
    ...DEFAULT_PRICE_BOOK.sheets,
    color: { ...DEFAULT_PRICE_BOOK.sheets.color, singleCents },
  },
});

describe.skipIf(!process.env.PRICING_TEST_DATABASE_URL)(
  "PostgreSQL price store",
  () => {
    let database: Awaited<ReturnType<typeof createTestDatabase>>;
    let stores: PriceStore[];
    beforeEach(async () => {
      database = await createTestDatabase();
      stores = [];
    });
    afterEach(async () => {
      await Promise.all(stores.map((store) => store.close()));
      await database.close();
    });
    async function open(options: Parameters<typeof openPriceStore>[1] = {}) {
      const store = await openPriceStore(database.url, options);
      stores.push(store);
      return store;
    }

    it("seeds the former prices once, including simultaneous panel starts", async () => {
      const opened = await Promise.all([open(), open(), open()]);
      expect(opened.filter((store) => store.initialized)).toHaveLength(1);
      expect(await opened[0]!.current()).toMatchObject({
        id: 1,
        priceBook: DEFAULT_PRICE_BOOK,
        note: SEED_NOTE,
        createdById: null,
      });
      expect(await opened[0]!.history()).toHaveLength(1);
    });

    it("saves author and note, and persists across new panel connections", async () => {
      const first = await open();
      const saved = await first.save({
        priceBook: withColor(18),
        baseVersionId: 1,
        note: "  Papier teurer  ",
        actor: admin,
      });
      expect(saved).toMatchObject({
        id: 2,
        note: "Papier teurer",
        createdById: admin.id,
      });
      const created = await first.createdAt();
      await stores.pop()!.close();
      const reopened = await open();
      expect(reopened.initialized).toBe(false);
      expect(await reopened.current()).toEqual(saved);
      expect(await reopened.createdAt()).toBe(created);
      const overview = await reopened.overview();
      expect(overview.current.id).toBe(overview.history[0]!.id);
      expect(overview.history.map((entry) => entry.id)).toEqual([2, 1]);
    });

    it("allows only one of two concurrent saves from the same base version", async () => {
      const first = await open();
      const second = await open();
      const results = await Promise.allSettled([
        first.save({
          priceBook: withColor(18),
          baseVersionId: 1,
          actor: admin,
        }),
        second.save({
          priceBook: withColor(20),
          baseVersionId: 1,
          actor: admin,
        }),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = results.find(
        (result) => result.status === "rejected",
      ) as PromiseRejectedResult;
      expect(rejected.reason).toBeInstanceOf(PriceBookConflictError);
      expect(await first.history()).toHaveLength(2);
    });

    it("rolls back unchanged, invalid and stale saves without losing a connection", async () => {
      const store = await open();
      await expect(
        store.save({
          priceBook: DEFAULT_PRICE_BOOK,
          baseVersionId: 1,
          actor: admin,
        }),
      ).rejects.toBeInstanceOf(PriceBookUnchangedError);
      await expect(
        store.save({
          priceBook: withColor(-1),
          baseVersionId: 1,
          actor: admin,
        }),
      ).rejects.toThrow();
      await store.save({
        priceBook: withColor(18),
        baseVersionId: 1,
        actor: admin,
      });
      await expect(
        store.save({
          priceBook: withColor(20),
          baseVersionId: 1,
          actor: admin,
        }),
      ).rejects.toBeInstanceOf(PriceBookConflictError);
      expect(await store.history()).toHaveLength(2);
      expect((await store.current()).priceBook).toEqual(withColor(18));
    });

    it("restores an earlier version as a new auditable version", async () => {
      const store = await open();
      await store.save({
        priceBook: withColor(18),
        baseVersionId: 1,
        actor: admin,
      });
      expect(
        await store.restore({ versionId: 1, baseVersionId: 2, actor: admin }),
      ).toMatchObject({
        id: 3,
        restoredFromId: 1,
        priceBook: DEFAULT_PRICE_BOOK,
      });
      await expect(
        store.restore({ versionId: 99, baseVersionId: 3, actor: admin }),
      ).rejects.toThrow("Diese Preisversion gibt es nicht.");
    });

    it("refuses the application database even with a different role in the URL", async () => {
      const shop = new URL(database.url);
      shop.username = "another-role";
      await expect(
        openPriceStore(database.url, { applicationDatabaseUrl: shop.href }),
      ).rejects.toThrow("andere Datenbank");
      expect(
        (
          await database.pool.query(
            "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'pricing'",
          )
        ).rowCount,
      ).toBe(0);
    });

    it("refuses databases containing application tables before writing anything", async () => {
      await database.pool.query(
        'CREATE TABLE public."Book" (id TEXT PRIMARY KEY)',
      );
      await expect(open()).rejects.toThrow("Shop-Tabellen");
      expect(
        (
          await database.pool.query(
            "SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'pricing'",
          )
        ).rowCount,
      ).toBe(0);
    });

    it("recovers after PostgreSQL terminates an idle pooled connection", async () => {
      let disconnected!: () => void;
      const idleError = new Promise<void>((resolve) => {
        disconnected = resolve;
      });
      const store = await open({ onError: () => disconnected() });
      await store.current();
      await database.pool.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND application_name = 'planner-pricing' AND pid <> pg_backend_pid()",
      );
      await idleError;
      expect((await store.current()).id).toBe(1);
    });

    it("refuses a database written by a newer panel", async () => {
      const store = await open();
      await database.pool.query(
        "UPDATE pricing.store_meta SET value = '99' WHERE key = 'schema_version'",
      );
      await expect(open()).rejects.toThrow("neueren oder unbekannten Version");
      expect(await store.history()).toHaveLength(1);
    });

    it("imports all historical IDs and continues the version sequence", async () => {
      const timestamp = "2026-10-27T12:00:00.000Z";
      const version = {
        id: 1,
        priceBook: DEFAULT_PRICE_BOOK,
        createdAt: timestamp,
        note: SEED_NOTE,
        createdById: null,
        createdByName: null,
        restoredFromId: null,
      };
      const archive: PriceBookArchive = {
        createdAt: timestamp,
        versions: [
          version,
          {
            ...version,
            id: 5,
            priceBook: withColor(18),
            createdById: admin.id,
            createdByName: admin.name,
          },
        ],
      };
      const store = await open({ importArchive: archive });
      expect((await store.current()).id).toBe(5);
      expect(await store.createdAt()).toBe(timestamp);
      const restored = await store.restore({
        versionId: 1,
        baseVersionId: 5,
        actor: admin,
      });
      expect(restored).toMatchObject({
        id: 6,
        restoredFromId: 1,
        priceBook: DEFAULT_PRICE_BOOK,
      });
      await expect(open({ importArchive: archive })).rejects.toThrow(
        "leere Preisdatenbank",
      );
      expect((await store.current()).id).toBe(6);
    });
  },
);
