import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_PRICE_BOOK } from "./price-book";
import { readLegacySqliteArchive } from "./legacy-import";
import { openPriceStore } from "./store";
import { createTestDatabase } from "./test-database";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function legacyFile() {
  const dir = mkdtempSync(join(tmpdir(), "pricing-legacy-"));
  dirs.push(dir);
  const path = join(dir, "pricing.sqlite");
  const db = new Database(path);
  db.exec(
    "CREATE TABLE price_book_versions (id INTEGER PRIMARY KEY, price_book TEXT, note TEXT, created_at TEXT, created_by_id TEXT, created_by_name TEXT, restored_from_id INTEGER); CREATE TABLE store_meta (key TEXT PRIMARY KEY, value TEXT); PRAGMA user_version = 1;",
  );
  const timestamp = "2026-10-27T12:00:00.000Z";
  db.prepare("INSERT INTO store_meta VALUES ('created_at', ?)").run(timestamp);
  const insert = db.prepare(
    "INSERT INTO price_book_versions VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  insert.run(
    1,
    JSON.stringify(DEFAULT_PRICE_BOOK),
    "Startwerte",
    timestamp,
    null,
    null,
    null,
  );
  insert.run(
    2,
    JSON.stringify({ ...DEFAULT_PRICE_BOOK, minimumUnitCents: 250 }),
    "Papier",
    timestamp,
    "admin",
    "Erika",
    null,
  );
  insert.run(
    3,
    JSON.stringify(DEFAULT_PRICE_BOOK),
    "Wiederhergestellt",
    timestamp,
    "admin",
    "Erika",
    1,
  );
  db.close();
  return path;
}

describe("legacy SQLite import", () => {
  it("reads authors, notes and restore references without changing the source file", () => {
    const path = legacyFile();
    const before = readFileSync(path);
    const archive = readLegacySqliteArchive(path);
    expect(archive.versions).toHaveLength(3);
    expect(archive.versions[1]).toMatchObject({
      id: 2,
      createdByName: "Erika",
      note: "Papier",
      priceBook: { minimumUnitCents: 250 },
    });
    expect(archive.versions[2]!.restoredFromId).toBe(1);
    expect(readFileSync(path)).toEqual(before);
  });
  it("refuses unknown SQLite schemas", () => {
    const path = legacyFile();
    const db = new Database(path);
    db.exec("PRAGMA user_version = 99");
    db.close();
    expect(() => readLegacySqliteArchive(path)).toThrow("Unbekannte SQLite");
  });
  it.skipIf(!process.env.PRICING_TEST_DATABASE_URL)(
    "imports a real SQLite file into PostgreSQL without changing any version",
    async () => {
      const archive = readLegacySqliteArchive(legacyFile());
      const database = await createTestDatabase();
      try {
        const store = await openPriceStore(database.url, {
          importArchive: archive,
        });
        try {
          expect((await store.history()).reverse()).toEqual(archive.versions);
          expect(await store.createdAt()).toBe(archive.createdAt);
        } finally {
          await store.close();
        }
      } finally {
        await database.close();
      }
    },
  );
});
