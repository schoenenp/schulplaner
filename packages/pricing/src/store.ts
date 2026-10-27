// Server-only: the price book lives in its own SQLite file, separate from the
// shop's PostgreSQL database. The panel owns the file; the shop reads prices
// through the panel's /api/pricing endpoint.
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import {
  DEFAULT_PRICE_BOOK,
  diffPriceBooks,
  parsePriceBook,
  type PriceBook,
} from "./price-book";

type SqliteValue = string | number | null;

type SqliteStatement = {
  get(...params: SqliteValue[]): unknown;
  all(...params: SqliteValue[]): unknown[];
  run(...params: SqliteValue[]): unknown;
};

/** The common subset of node:sqlite's DatabaseSync and bun:sqlite's Database. */
export type SqliteDatabase = {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
};

export function openSqliteDatabase(path: string): SqliteDatabase {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  // Resolved at runtime so bundlers never try to package a driver. The apps
  // run on Node (node:sqlite); the test suites run on Bun (bun:sqlite).
  const { getBuiltinModule } = process as unknown as {
    getBuiltinModule: (id: string) => unknown;
  };
  if (process.versions.bun) {
    const { Database } = getBuiltinModule("bun:sqlite") as {
      Database: new (path: string, options: { create: boolean }) => SqliteDatabase;
    };
    return new Database(path, { create: true });
  }
  const { DatabaseSync } = getBuiltinModule("node:sqlite") as {
    DatabaseSync: new (path: string) => SqliteDatabase;
  };
  return new DatabaseSync(path);
}

export type PriceBookActor = { id: string; name: string | null };

export type PriceBookVersion = {
  id: number;
  priceBook: PriceBook;
  note: string | null;
  createdAt: string;
  createdById: string | null;
  createdByName: string | null;
  restoredFromId: number | null;
};

export class PriceBookConflictError extends Error {
  constructor(readonly currentVersionId: number) {
    super("Die Preise wurden inzwischen geändert. Bitte neu laden.");
    this.name = "PriceBookConflictError";
  }
}

export class PriceBookUnchangedError extends Error {
  constructor() {
    super("Die Preise entsprechen bereits der aktuellen Version.");
    this.name = "PriceBookUnchangedError";
  }
}

export const SEED_NOTE = "Startwerte (bisher fest im Code hinterlegt)";

const MIGRATIONS = [
  `CREATE TABLE price_book_versions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     price_book TEXT NOT NULL,
     note TEXT,
     created_at TEXT NOT NULL,
     created_by_id TEXT,
     created_by_name TEXT,
     restored_from_id INTEGER REFERENCES price_book_versions (id)
   );
   CREATE TABLE store_meta (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   );`,
];

type VersionRow = {
  id: number;
  price_book: string;
  note: string | null;
  created_at: string;
  created_by_id: string | null;
  created_by_name: string | null;
  restored_from_id: number | null;
};

const VERSION_COLUMNS =
  "id, price_book, note, created_at, created_by_id, created_by_name, restored_from_id";

function transaction<T>(db: SqliteDatabase, run: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = run();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function migrate(db: SqliteDatabase) {
  const { user_version: schemaVersion } = db
    .prepare("PRAGMA user_version")
    .get() as { user_version: number };
  if (schemaVersion > MIGRATIONS.length) {
    throw new Error(
      "Die Preisdatenbank stammt aus einer neueren Version des Panels.",
    );
  }
  for (let version = schemaVersion; version < MIGRATIONS.length; version++) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
    });
  }
}

function toVersion(row: VersionRow): PriceBookVersion {
  return {
    id: Number(row.id),
    priceBook: parsePriceBook(JSON.parse(row.price_book)),
    note: row.note,
    createdAt: row.created_at,
    createdById: row.created_by_id,
    createdByName: row.created_by_name,
    restoredFromId:
      row.restored_from_id === null ? null : Number(row.restored_from_id),
  };
}

export type PriceStore = ReturnType<typeof createPriceStore>;

export function createPriceStore(
  db: SqliteDatabase,
  { now = () => new Date() }: { now?: () => Date } = {},
) {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  migrate(db);

  const insertVersion = (
    priceBook: PriceBook,
    note: string | null,
    actor: PriceBookActor | null,
    restoredFromId: number | null,
  ) =>
    db
      .prepare(
        `INSERT INTO price_book_versions
           (price_book, note, created_at, created_by_id, created_by_name, restored_from_id)
         VALUES (?, ?, ?, ?, ?, ?)
         RETURNING ${VERSION_COLUMNS}`,
      )
      .get(
        JSON.stringify(priceBook),
        note,
        now().toISOString(),
        actor?.id ?? null,
        actor?.name ?? null,
        restoredFromId,
      ) as VersionRow;

  const latestRow = () =>
    db
      .prepare(
        `SELECT ${VERSION_COLUMNS} FROM price_book_versions ORDER BY id DESC LIMIT 1`,
      )
      .get() as VersionRow | undefined;

  const initialized = transaction(db, () => {
    if (latestRow()) return false;
    insertVersion(DEFAULT_PRICE_BOOK, SEED_NOTE, null, null);
    db.prepare("INSERT INTO store_meta (key, value) VALUES ('created_at', ?)").run(
      now().toISOString(),
    );
    return true;
  });

  const current = (): PriceBookVersion => toVersion(latestRow()!);

  const commit = (
    priceBook: PriceBook,
    baseVersionId: number,
    note: string | null,
    actor: PriceBookActor,
    restoredFromId: number | null,
  ) =>
    transaction(db, () => {
      const latest = current();
      if (latest.id !== baseVersionId) {
        throw new PriceBookConflictError(latest.id);
      }
      if (diffPriceBooks(latest.priceBook, priceBook).length === 0) {
        throw new PriceBookUnchangedError();
      }
      return toVersion(insertVersion(priceBook, note, actor, restoredFromId));
    });

  return {
    /** True when this call created the database and seeded the defaults. */
    initialized,

    current,

    history(limit = 50): PriceBookVersion[] {
      return (
        db
          .prepare(
            `SELECT ${VERSION_COLUMNS} FROM price_book_versions ORDER BY id DESC LIMIT ?`,
          )
          .all(limit) as VersionRow[]
      ).map(toVersion);
    },

    createdAt(): string {
      const row = db
        .prepare("SELECT value FROM store_meta WHERE key = 'created_at'")
        .get() as { value: string } | undefined;
      return row?.value ?? current().createdAt;
    },

    save(input: {
      priceBook: unknown;
      baseVersionId: number;
      note?: string | null;
      actor: PriceBookActor;
    }): PriceBookVersion {
      return commit(
        parsePriceBook(input.priceBook),
        input.baseVersionId,
        input.note?.trim() || null,
        input.actor,
        null,
      );
    },

    restore(input: {
      versionId: number;
      baseVersionId: number;
      actor: PriceBookActor;
    }): PriceBookVersion {
      const row = db
        .prepare(`SELECT ${VERSION_COLUMNS} FROM price_book_versions WHERE id = ?`)
        .get(input.versionId) as VersionRow | undefined;
      if (!row) throw new Error("Diese Preisversion gibt es nicht.");
      return commit(
        toVersion(row).priceBook,
        input.baseVersionId,
        `Version ${input.versionId} wiederhergestellt`,
        input.actor,
        input.versionId,
      );
    },

    close() {
      db.close();
    },
  };
}

export function openPriceStore(path: string) {
  const db = openSqliteDatabase(path);
  // Durable writes; price changes are rare and must survive a container stop.
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = FULL");
  return createPriceStore(db);
}
