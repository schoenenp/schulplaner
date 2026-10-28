// Used only by the optional one-time import command, never by the panel.
import { existsSync } from "node:fs";
import { parsePriceBookArchive, type PriceBookArchive } from "./store";

type LegacyRow = {
  id: number;
  price_book: string;
  note: string | null;
  created_at: string;
  created_by_id: string | null;
  created_by_name: string | null;
  restored_from_id: number | null;
};
type LegacyDatabase = {
  prepare(sql: string): { all(): unknown[]; get(): unknown };
  exec(sql: string): void;
  close(): void;
};

/** Read-only snapshot: the old file is never changed or removed. */
export function readLegacySqliteArchive(path: string): PriceBookArchive {
  if (!existsSync(path))
    throw new Error("Die SQLite-Quelldatei wurde nicht gefunden.");
  const { getBuiltinModule } = process as unknown as {
    getBuiltinModule: (id: string) => unknown;
  };
  let db: LegacyDatabase;
  if (process.versions.bun) {
    const { Database } = getBuiltinModule("bun:sqlite") as {
      Database: new (
        path: string,
        options: { readonly: boolean },
      ) => LegacyDatabase;
    };
    db = new Database(path, { readonly: true });
  } else {
    const { DatabaseSync } = getBuiltinModule("node:sqlite") as {
      DatabaseSync: new (
        path: string,
        options: { readOnly: boolean },
      ) => LegacyDatabase;
    };
    db = new DatabaseSync(path, { readOnly: true });
  }
  try {
    db.exec("BEGIN");
    const schema = db.prepare("PRAGMA user_version").get() as {
      user_version: number;
    };
    if (schema.user_version !== 1)
      throw new Error(
        "Unbekannte SQLite-Preisversion. Der Import wurde abgebrochen.",
      );
    const rows = db
      .prepare("SELECT * FROM price_book_versions ORDER BY id")
      .all() as LegacyRow[];
    const meta = db
      .prepare("SELECT value FROM store_meta WHERE key = 'created_at'")
      .get() as { value: string } | undefined;
    return parsePriceBookArchive({
      createdAt: meta?.value ?? rows[0]?.created_at,
      versions: rows.map((row) => ({
        id: Number(row.id),
        priceBook: JSON.parse(row.price_book),
        note: row.note,
        createdAt: row.created_at,
        createdById: row.created_by_id,
        createdByName: row.created_by_name,
        restoredFromId: row.restored_from_id,
      })),
    });
  } finally {
    db.close();
  }
}
