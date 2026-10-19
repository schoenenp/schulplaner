import { main, options, connect, snapshot, identity, inventory, fingerprints, sequenceMinimums, manifest, writeReport } from "./core";

await main(async () => {
  const config = options();
  const source = connect(config.sourceUrl, "mysql");
  try {
    const report = await snapshot(source, "mysql", async db => ({
      version: 1, kind: "source-audit", startedAt: new Date().toISOString(), schemaSha256: manifest.schemaSha256,
      identity: await identity(db, "mysql", config.sourceName),
      inventory: await inventory(db, "mysql"),
      fingerprints: await fingerprints(db, "mysql"),
      sequenceMinimums: await sequenceMinimums(db),
    }));
    await writeReport(config.report, report);
    console.log(`Audited ${manifest.tables.length} tables; report written to ${config.report}`);
  } finally { await source.close(); }
});
