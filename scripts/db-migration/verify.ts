import { main, options, connect, snapshot, identity, inventory, compare, manifest, writeReport } from "./core";

await main(async () => {
  const config = options();
  if (!config.targetUrl || !config.targetName || !config.flags.has("--source-frozen") || !config.flags.has("--target-isolated")) throw new Error("Verification requires explicit target settings, --source-frozen and --target-isolated");
  const source = connect(config.sourceUrl, "mysql"), target = connect(config.targetUrl, "postgresql");
  try {
    const report = await snapshot(source, "mysql", read => snapshot(target, "postgresql", async other => ({
      version: 1, kind: "verification", startedAt: new Date().toISOString(), schemaSha256: manifest.schemaSha256,
      sourceIdentity: await identity(read, "mysql", config.sourceName),
      targetIdentity: await identity(other, "postgresql", config.targetName!),
      sourceInventory: await inventory(read, "mysql"), targetInventory: await inventory(other, "postgresql"),
      ...await compare(read, other),
    })));
    await writeReport(config.report, report);
    if (!report.passed) throw new Error(`Verification failed; see ${config.report}. Keep writes paused`);
    console.log(`All ${manifest.tables.length} tables and ID sequences match`);
  } finally { await Promise.all([source.close(), target.close()]); }
});
