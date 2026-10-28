import { readLegacySqliteArchive } from "../src/legacy-import";
import { openPriceStore } from "../src/store";

const source = process.argv[2];
const url = process.env.PRICING_DATABASE_URL;
if (!source || !url) {
  console.error(
    "Usage: set PRICING_DATABASE_URL, then bun run --cwd packages/pricing import:sqlite /path/to/pricing.sqlite",
  );
  process.exit(1);
}
try {
  const archive = readLegacySqliteArchive(source);
  const store = await openPriceStore(url, {
    applicationDatabaseUrl: process.env.DATABASE_URL,
    importArchive: archive,
  });
  try {
    console.log(
      `Imported ${archive.versions.length} price versions; current version ${(await store.current()).id}.`,
    );
  } finally {
    await store.close();
  }
} catch {
  console.error(
    "Pricing import failed. Check the source file, database connection and permissions; the target must have no price versions. Existing prices are never overwritten.",
  );
  process.exit(1);
}
