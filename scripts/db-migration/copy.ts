import { randomUUID } from "node:crypto";
import { main, options, connect, snapshot, identity, inventory, fingerprints, copyOrder, batches, insertBatch, sequenceMinimums, quote, manifest, writeReport, compare } from "./core";

await main(async () => {
  const config = options();
  if (!config.targetUrl || !config.targetName) throw new Error("Set POSTGRES_TARGET_URL and --expect-target");
  if (!config.report || await Bun.file(config.report).exists()) throw new Error("Choose a fresh --report path before copying");
  if (!config.flags.has("--source-frozen") || !config.flags.has("--target-isolated")) throw new Error("Copy requires --source-frozen and --target-isolated: fence both databases from application writes first");
  if (config.flags.has("--apply") && !config.flags.has("--source-metadata-reviewed")) throw new Error("Apply requires --source-metadata-reviewed: compare a complete DBA schema export, since a read-only account can have limited metadata visibility");
  const source = connect(config.sourceUrl, "mysql"), target = connect(config.targetUrl, "postgresql");
  const runId = randomUUID(); const startedAt = new Date().toISOString();
  try {
    const report = await snapshot(source, "mysql", async read => {
      const sourceIdentity = await identity(read, "mysql", config.sourceName);
      const sourceInventory = await inventory(read, "mysql");
      return target.begin(async write => {
        await write.unsafe("SET LOCAL TIME ZONE 'UTC'");
        await write.unsafe("SET LOCAL search_path = pg_catalog, public");
        await write.unsafe("SET LOCAL lock_timeout = '15s'");
        const targetIdentity = await identity(write, "postgresql", config.targetName!);
        await write.unsafe(`LOCK TABLE ${manifest.tables.map(t => quote(t.name, "postgresql")).join(",")} IN ACCESS EXCLUSIVE MODE`);
        const targetInventory = await inventory(write, "postgresql");
        for (const table of manifest.tables) {
          const rows = await write.unsafe(`SELECT EXISTS(SELECT 1 FROM ${quote(table.name, "postgresql")}) AS occupied`);
          if (rows[0].occupied) throw new Error(`Refusing a nonempty target: ${table.name}`);
        }
        if (!config.flags.has("--apply")) {
          return { version: 1, kind: "copy-dry-run", runId, startedAt, schemaSha256: manifest.schemaSha256, sourceIdentity, targetIdentity, sourceInventory, targetInventory, source: await fingerprints(read, "mysql") };
        }
        for (const table of copyOrder()) {
          let count = 0;
          for await (const rows of batches(read, table, "mysql")) { await insertBatch(write, table, rows); count += rows.length; }
          console.log(`Copied ${table.name}: ${count} rows`);
        }
        const book = manifest.tables.find(t => t.name === "Book")!;
        for await (const rows of batches(read, book, "mysql")) {
          for (const row of rows.filter(r => r.copyFromId !== null)) {
            await write.unsafe('UPDATE "Book" SET "copyFromId"=$1 WHERE id=$2', [row.copyFromId!, row.id!]);
          }
        }
        const minimums = await sequenceMinimums(read);
        for (const [table, next] of Object.entries(minimums)) {
          await write.unsafe("SELECT setval(pg_get_serial_sequence($1,'id'),$2::bigint,false)", [quote(table, "postgresql"), next]);
        }
        const verification = await compare(read, write);
        if (!verification.passed) {
          await writeReport(config.report, { version: 1, kind: "copy-failed", runId, startedAt, schemaSha256: manifest.schemaSha256, ...verification });
          throw new Error(`In-transaction verification failed; target rows will be rolled back. See ${config.report}`);
        }
        return { version: 1, kind: "copy", runId, startedAt, schemaSha256: manifest.schemaSha256, sourceIdentity, targetIdentity, sourceInventory, targetInventory, ...verification };
      });
    });
    // A fresh snapshot detects source commits that occurred after the copy snapshot.
    const sourceAfter = await snapshot(source, "mysql", db => fingerprints(db, "mysql"));
    const sourceBefore = "source" in report ? report.source : undefined;
    if (JSON.stringify(sourceAfter) !== JSON.stringify(sourceBefore)) {
      await writeReport(config.report, { ...report, passed: false, sourceChanged: true, sourceAfter, finishedAt: new Date().toISOString() });
      throw new Error("Source changed during copy; keep maintenance active and rebuild a fresh target");
    }
    if (config.flags.has("--apply")) await target.unsafe("ANALYZE");
    await writeReport(config.report, { ...report, finishedAt: new Date().toISOString() });
    console.log(config.flags.has("--apply") ? "Copy committed and verified; run independent verification before opening writes" : "Dry run passed; no application rows copied");
  } finally { await Promise.all([source.close(), target.close()]); }
});
