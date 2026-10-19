import { inventoryCheckoutSessions } from "../../apps/genbooks/scripts/migration-payment-sessions";
import { paymentPlan, type PendingPayment } from "./payment-plan";
import { main, options, connect, snapshot, identity, writeReport } from "./core";

await main(async () => {
  const config = options();
  if (config.flags.has("--apply")) throw new Error("This command creates a read-only reconciliation plan; replay reviewed sessions through order.validate after database verification");
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || !config.report || await Bun.file(config.report).exists()) throw new Error("Set STRIPE_SECRET_KEY and choose a fresh --report path");
  const source = connect(config.sourceUrl, "mysql");
  try {
    const { sourceIdentity, rows } = await snapshot(source, "mysql", async db => ({
      sourceIdentity: await identity(db, "mysql", config.sourceName),
      rows: await db.unsafe<PendingPayment[]>("SELECT b.id AS bookOrderId, p.id AS paymentId, p.shopId AS shopId, CAST(p.status AS CHAR) AS paymentStatus, p.currency AS currency, CAST(p.total AS CHAR) AS total, o.orderKey AS orderKey FROM Payment p LEFT JOIN BookOrder b ON b.paymentId=p.id LEFT JOIN `Order` o ON o.id=b.orderId"),
    }));
    const outstanding = rows.filter(row => row.paymentStatus === "PENDING" || !row.orderKey);
    const sessions = await inventoryCheckoutSessions(secret, outstanding.flatMap(row => row.shopId ? [row.shopId] : []), new Set(outstanding.flatMap(row => row.bookOrderId ? [row.bookOrderId] : [])));
    const actions = paymentPlan(outstanding, sessions);
    await writeReport(config.report, { version: 1, kind: "payment-reconciliation-plan", createdAt: new Date().toISOString(), sourceIdentity, actions });
    console.log(`Inventoried ${actions.length} outstanding payments; private replay plan: ${config.report}`);
    if (actions.some(action => action.action === "manual_review")) process.exitCode = 1;
  } finally { await source.close(); }
});
