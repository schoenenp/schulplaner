import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient, finalizeBookOrder } from "db";
import { batches, connect, copyOrder, manifest, quote, snapshot, type Row, type Table } from "./core";

const mysqlUrl = process.env.MIGRATION_TEST_MYSQL_ADMIN_URL;
const pgUrl = process.env.MIGRATION_TEST_POSTGRES_ADMIN_URL;
const enabled = Boolean(mysqlUrl && pgUrl);
const suite = enabled ? describe : describe.skip;

function localUrl(value: string) {
  const url = new URL(value);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) throw new Error("Integration tests require disposable loopback databases");
  return url;
}

suite("MySQL to PostgreSQL rehearsal", () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const sourceName = `migration_test_source_${suffix}`;
  const targetName = `migration_test_target_${suffix}`;
  const rollbackName = `migration_test_rollback_${suffix}`;
  const deployName = `migration_test_deploy_${suffix}`;
  const user = `migration_reader_${suffix}`;
  let source: ReturnType<typeof connect>, target: ReturnType<typeof connect>;
  let mysqlAdmin: ReturnType<typeof connect>, pgAdmin: ReturnType<typeof connect>;
  let sourceUrl: string, targetUrl: string, rollbackUrl: string, deployUrl: string, directory: string;
  let prisma: PrismaClient;
  const report = (name: string) => join(directory, `${name}.json`);
  const ids = new Map(manifest.tables.filter(t => t.columns.some(c => c.name === "id")).map((t, i) => [t.name, t.columns.find(c => c.name === "id")!.type === "Int" ? String(40 + i) : `fixture_${t.name}`]));
  ids.set("Book", "template");

  async function cli(script: string, extra: string[] = [], destination = targetUrl, expected = targetName) {
    const command = [process.execPath, "--no-env-file", resolve(import.meta.dir, `${script}.ts`), "--expect-source", sourceName];
    if (script !== "audit") command.push("--expect-target", expected, "--source-frozen", "--target-isolated", "--source-metadata-reviewed");
    command.push(...extra);
    const child = Bun.spawn(command, {
      cwd: resolve(import.meta.dir, "../.."),
      env: { PATH: process.env.PATH, MYSQL_SOURCE_URL: sourceUrl, ...(script === "audit" ? {} : { POSTGRES_TARGET_URL: destination }) },
      stdout: "pipe", stderr: "pipe",
    });
    const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    return { stdout, stderr, exit };
  }

  async function loadSchema(db: ReturnType<typeof connect>, sql: string) {
    // Generated test DDL contains no stored routines or semicolons in literals.
    for (const statement of sql.split(";").filter(s => s.trim())) await db.unsafe(statement);
  }

  async function seed() {
    for (const table of copyOrder()) {
      const row: Row = {};
      for (const column of table.columns) {
        row[column.name] = column.type === "DateTime" ? "2024-02-29 23:59:59.123"
          : column.type === "Boolean" ? "1"
          : column.type === "Int" ? "123"
          : column.type === "Enum" ? column.values![0]!
          : column.type === "Json" ? '{"large":9007199254740993123,"fraction":1.2300,"array":[null,true,"Ä 😀"]}'
          : `${table.name}_${column.name}`;
        if (column.name === "id") row[column.name] = ids.get(table.name)!;
      }
      for (const reference of table.references) for (const column of reference.columns) row[column] = ids.get(reference.table)!;
      if (table.name === "Book") { row.copyFromId = null; row.isPublic = "0"; row.isFeatured = "0"; }
      if (table.name === "User") { row.email = "Schule+Ä@Example.DE"; row.name = "  Müller 😀\n  "; }
      if (table.name === "File") { row.src = "/storage/ümlaut.pdf"; row.srcGrayscale = null; row.pageCount = null; }
      if (table.name === "VerificationToken") row.identifier = "Schule+Ä@Example.DE";
      if (table.name === "PartnerOrder") row.schoolSnapshot = "null";
      if (table.name === "PartnerOrderTransition") row.payload = null;
      await insertSource(table, row);
      if (table.name === "Book") await insertSource(table, { ...row, id: "copy", copyFromId: "template", partnerClaimId: null, name: "Copy" });
      if (table.name === "File") {
        for (let i = 0; i < 501; i++) await insertSource(table, { ...row, id: `disconnected_${String(i).padStart(4,"0")}`, name: null, src: `/storage/disconnected-${i}.pdf` });
      }
      if (table.name === "Tag") {
        for (const id of ["5", "15"]) await insertSource(table, { ...row, id });
      }
      if (table.name === "_ModuleToTag") {
        for (const id of ["5", "15"]) await insertSource(table, { ...row, B: id });
      }
    }
    for (const table of manifest.tables.filter(t => t.columns.some(c => c.autoIncrement))) {
      await source.unsafe(`ALTER TABLE ${quote(table.name, "mysql")} AUTO_INCREMENT=777`);
    }
  }

  async function insertSource(table: Table, row: Row) {
    await source.unsafe(`INSERT INTO ${quote(table.name, "mysql")} (${table.columns.map(c => quote(c.name, "mysql")).join(",")}) VALUES (${table.columns.map(() => "?").join(",")})`, table.columns.map(c => row[c.name]));
  }

  beforeAll(async () => {
    const mysql = localUrl(mysqlUrl!), pg = localUrl(pgUrl!);
    mysqlAdmin = connect(mysql.toString(), "mysql"); pgAdmin = connect(pg.toString(), "postgresql");
    await mysqlAdmin.unsafe(`CREATE DATABASE ${quote(sourceName, "mysql")} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    for (const name of [targetName, rollbackName, deployName]) await pgAdmin.unsafe(`CREATE DATABASE ${quote(name, "postgresql")}`);
    mysql.pathname = `/${sourceName}`; pg.pathname = `/${targetName}`;
    source = connect(mysql.toString(), "mysql"); targetUrl = pg.toString(); target = connect(targetUrl, "postgresql");
    pg.pathname = `/${rollbackName}`; rollbackUrl = pg.toString();
    pg.pathname = `/${deployName}`; deployUrl = pg.toString();
    await loadSchema(source, await readFile(resolve(import.meta.dir, "../../packages/db/prisma/mysql/schema.sql"), "utf8"));
    const targetDDL = await readFile(resolve(import.meta.dir, "../../packages/db/prisma/migrations/0_postgresql_init/migration.sql"), "utf8");
    await loadSchema(target, targetDDL);
    // A role-named schema normally precedes public in PostgreSQL's search path.
    // Prove the CLI never copies/compares a shadow set of application tables.
    const targetRole = localUrl(targetUrl).username;
    await target.unsafe(`CREATE SCHEMA ${quote(targetRole,"postgresql")}`);
    for (const table of manifest.tables) await target.unsafe(`CREATE TABLE ${quote(targetRole,"postgresql")}.${quote(table.name,"postgresql")} (LIKE public.${quote(table.name,"postgresql")} INCLUDING ALL)`);
    await target.unsafe("SET search_path = pg_catalog, public");
    const rollback = connect(rollbackUrl, "postgresql");
    try { await loadSchema(rollback, targetDDL); } finally { await rollback.close(); }
    await seed();
    await mysqlAdmin.unsafe(`CREATE USER '${user}'@'127.0.0.1' IDENTIFIED BY 'local-rehearsal'`);
    await mysqlAdmin.unsafe(`GRANT SELECT, SHOW VIEW ON ${quote(sourceName, "mysql")}.* TO '${user}'@'127.0.0.1'`);
    mysql.username = user; mysql.password = "local-rehearsal"; sourceUrl = mysql.toString();
    directory = await mkdtemp(join(tmpdir(), "books-migration-test-"));
    prisma = new PrismaClient({ datasourceUrl: targetUrl });
  }, 60000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await Promise.all([source?.close(), target?.close()]);
    if (mysqlAdmin) {
      await mysqlAdmin.unsafe(`DROP USER IF EXISTS '${user}'@'127.0.0.1'`);
      await mysqlAdmin.unsafe(`DROP DATABASE IF EXISTS ${quote(sourceName, "mysql")}`);
    }
    if (pgAdmin) for (const name of [targetName, rollbackName, deployName]) await pgAdmin.unsafe(`DROP DATABASE IF EXISTS ${quote(name, "postgresql")} WITH (FORCE)`);
    await Promise.all([mysqlAdmin?.close(), pgAdmin?.close()]);
  });

  it("deploys the PostgreSQL baseline through Prisma and can deploy again without changes", async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const child = Bun.spawn([process.execPath, "run", "--cwd", "packages/db", "db:migrate"], {
        cwd: resolve(import.meta.dir, "../.."), env: { PATH: process.env.PATH, DATABASE_URL: deployUrl }, stdout: "pipe", stderr: "pipe",
      });
      const [, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      expect(code, stderr).toBe(0);
    }
    const deployed = connect(deployUrl, "postgresql");
    try {
      expect((await deployed.unsafe('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL')).map((r: { migration_name: string }) => r.migration_name)).toEqual(["0_postgresql_init"]);
    } finally { await deployed.close(); }
  }, 30000);

  it("audits every physical table using a read-only source account", async () => {
    const result = await cli("audit", ["--report", report("audit")]);
    expect(result.exit, result.stderr).toBe(0);
    const evidence = await Bun.file(report("audit")).json();
    expect(Object.keys(evidence.fingerprints)).toHaveLength(29);
    expect(evidence.fingerprints.Book.count).toBe(2);
    expect(evidence.sequenceMinimums.Order).toBe("777");
    const reader = connect(sourceUrl, "mysql");
    try { await expect((async () => { await reader.unsafe("DELETE FROM `File`"); })()).rejects.toThrow(); } finally { await reader.close(); }
  });

  it("dry-runs without inserting rows, then copies and independently verifies all contents", async () => {
    const dry = await cli("copy", ["--report", report("dry")]); expect(dry.exit, dry.stderr).toBe(0);
    expect((await target.unsafe('SELECT COUNT(*)::text AS n FROM "User"'))[0].n).toBe("0");
    const copied = await cli("copy", ["--apply", "--report", report("copy")]); expect(copied.exit, copied.stderr).toBe(0);
    const verification = await cli("verify", ["--report", report("verified")]); expect(verification.exit, verification.stderr).toBe(0);
    const evidence = await Bun.file(report("verified")).json();
    expect(evidence.passed).toBeTrue(); expect(Object.keys(evidence.target)).toHaveLength(29);
    expect(evidence.target).toEqual(evidence.source);
    expect(evidence.sequences.Order.next).toBe("777");
    expect((await target.unsafe(`SELECT COUNT(*)::text AS n FROM ${quote(localUrl(targetUrl).username,"postgresql")}."User"`))[0].n).toBe("0");
  }, 30000);

  it("preserves mapped columns, self-references, JSON precision, Unicode, dates and joins", async () => {
    expect((await target.unsafe('SELECT "copyFromId" FROM "Book" WHERE id=\'copy\''))[0].copyFromId).toBe("template");
    expect((await target.unsafe('SELECT "partnerSnapshot"::text AS value FROM "PartnerOrder"'))[0].value).toContain("9007199254740993123");
    expect((await target.unsafe('SELECT "schoolSnapshot"::text AS value, "schoolSnapshot" IS NULL AS sql_null FROM "PartnerOrder"'))[0]).toEqual({ value: "null", sql_null: false });
    expect((await target.unsafe('SELECT payload IS NULL AS sql_null FROM "PartnerOrderTransition"'))[0].sql_null).toBeTrue();
    expect((await target.unsafe('SELECT "isPublic", "isFeatured", "isTemplate" FROM "Book" LIMIT 1'))[0]).toEqual({ isPublic: false, isFeatured: false, isTemplate: true });
    expect((await target.unsafe('SELECT name,email::text AS email FROM "User"'))[0]).toEqual({ name: "  Müller 😀\n  ", email: "Schule+Ä@Example.DE" });
    expect((await target.unsafe('SELECT to_char("createdAt",\'YYYY-MM-DD HH24:MI:SS.US\') AS value FROM "Book" LIMIT 1'))[0].value).toBe("2024-02-29 23:59:59.123000");
    const module = await prisma.module.findUniqueOrThrow({ where: { id: ids.get("Module")! }, include: { files: true, allowedTags: true, books: { include: { locations: true } } } });
    expect(module.files).toHaveLength(1); expect(module.allowedTags).toHaveLength(3); expect(module.books[0]!.locations).toHaveLength(1);
    expect(await prisma.file.count()).toBe(502);
    expect((await target.unsafe('SELECT "sponsorUserId" FROM "Campaign"'))[0].sponsorUserId).toBe("Campaign_sponsorUserId");
  });

  it("reports changed columns and missing relationship rows", async () => {
    await target.unsafe('UPDATE "File" SET src=\'/tampered.pdf\' WHERE id=$1', [ids.get("File")]);
    const changed = await cli("verify", ["--report", report("changed")]); expect(changed.exit).toBe(1);
    expect((await Bun.file(report("changed")).json()).differences[0].columns).toEqual(["src"]);
    await target.unsafe('UPDATE "File" SET src=\'/storage/ümlaut.pdf\' WHERE id=$1', [ids.get("File")]);
    await target.unsafe('DELETE FROM "_ModuleToTag"');
    const removed = await cli("verify", ["--report", report("removed")]); expect(removed.exit).toBe(1);
    expect((await Bun.file(report("removed")).json()).differences[0].table).toBe("_ModuleToTag");
    for (const id of [ids.get("Tag"), "5", "15"]) await target.unsafe('INSERT INTO "_ModuleToTag" ("A","B") VALUES ($1,$2)', [ids.get("Module"), id]);
  });

  it("scans integer and composite keys across page boundaries without collation dependence", async () => {
    for (const name of ["Book", "Tag", "_ModuleToTag"]) {
      const table = manifest.tables.find(t => t.name === name)!;
      const read = async (db: ReturnType<typeof connect>, engine: "mysql" | "postgresql") => snapshot(db, engine, async tx => {
        const result: Row[] = []; for await (const rows of batches(tx, table, engine, 1)) result.push(...rows); return result;
      });
      expect(await read(target, "postgresql")).toEqual(await read(source, "mysql"));
    }
  });

  it("refuses unexpected schema, invalid booleans and nonempty targets", async () => {
    await source.unsafe("ALTER TABLE `File` ADD COLUMN unexpected_data TEXT NULL");
    const drift = await cli("audit", ["--report", report("drift")]); expect(drift.exit).toBe(1); expect(drift.stderr).toContain("Column inventory mismatch");
    await source.unsafe("ALTER TABLE `File` DROP COLUMN unexpected_data");
    await source.unsafe("UPDATE `Book` SET isTemplate=2");
    const invalid = await cli("audit", ["--report", report("invalid")]); expect(invalid.exit).toBe(1); expect(invalid.stderr).toContain("Book.isTemplate");
    await source.unsafe("UPDATE `Book` SET isTemplate=1");
    const occupied = await cli("copy", ["--apply", "--report", report("occupied")]); expect(occupied.exit).toBe(1); expect(occupied.stderr).toContain("nonempty target");
    expect(await prisma.book.count()).toBe(2);
  });

  it("refuses wrong database identities, changed defaults and missing indexes", async () => {
    const wrong = await cli("audit", ["--expect-source", "wrong_database", "--report", report("wrong")]);
    expect(wrong.exit).toBe(1); expect(wrong.stderr).toContain("expected database name");
    await target.unsafe('ALTER TABLE "Payment" ALTER COLUMN currency SET DEFAULT \'USD\'');
    const defaults = await cli("verify", ["--report", report("defaults")]);
    expect(defaults.exit).toBe(1); expect(defaults.stderr).toContain("default drift");
    await target.unsafe('ALTER TABLE "Payment" ALTER COLUMN currency SET DEFAULT \'EUR\'');
    await target.unsafe('DROP INDEX "Book_createdById_idx"');
    const indexes = await cli("verify", ["--report", report("indexes")]);
    expect(indexes.exit).toBe(1); expect(indexes.stderr).toContain("index missing");
    await target.unsafe('CREATE INDEX "Book_createdById_idx" ON "Book"("createdById")');
  });

  it("rolls back the entire target on a rejected relationship", async () => {
    await source.unsafe("SET FOREIGN_KEY_CHECKS=0");
    await source.unsafe("UPDATE `BookModule` SET moduleId='orphan'");
    await source.unsafe("SET FOREIGN_KEY_CHECKS=1");
    try {
      const failed = await cli("copy", ["--apply", "--report", report("rollback")], rollbackUrl, rollbackName);
      expect(failed.exit).toBe(1);
      const rollback = connect(rollbackUrl, "postgresql");
      try { for (const table of manifest.tables) expect((await rollback.unsafe(`SELECT COUNT(*)::text AS n FROM ${quote(table.name,"postgresql")}`))[0].n).toBe("0"); }
      finally { await rollback.close(); }
    } finally { await source.unsafe("UPDATE `BookModule` SET moduleId=?", [ids.get("Module")]); }
  });

  it("retains mixed-case email identity and enforces its uniqueness", async () => {
    expect((await prisma.user.findUnique({ where: { email: "schule+ä@example.de" } }))?.id).toBe(ids.get("User"));
    expect((await prisma.verificationToken.findUnique({ where: { identifier_token: { identifier: "schule+ä@example.de", token: "VerificationToken_token" } } }))?.identifier).toBe("Schule+Ä@Example.DE");
    await expect((async () => { await prisma.user.create({ data: { email: "SCHULE+Ä@EXAMPLE.DE" } }); })()).rejects.toThrow();
  });

  it("preserves source next IDs and finalizes simultaneous checkouts exactly once", async () => {
    const book = await prisma.book.create({ data: { name: "Concurrency test", createdById: ids.get("User") } });
    const payment = await prisma.payment.create({ data: {} });
    const bookOrder = await prisma.bookOrder.create({ data: { quantity: 1, bookId: book.id, paymentId: payment.id } });
    const results = await Promise.all(Array.from({ length: 12 }, () => finalizeBookOrder(prisma, { bookOrderId: bookOrder.id, checkoutSessionId: "cs_concurrency_test", paymentStatus: "SUCCEEDED", total: 900, shippingCost: 100 }, id => `ORD-TEST-${id}`)));
    expect(results.filter(r => r.newlyFinalized)).toHaveLength(1);
    expect(new Set(results.map(r => r.orderId)).size).toBe(1);
    expect(results[0]!.orderId).toBe(777);
    expect(await prisma.order.count({ where: { bookOrder: { id: bookOrder.id } } })).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: results[0]!.orderId } })).userId).toBe(ids.get("User")!);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).total).toBe(900);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).shopId).toBe("cs_concurrency_test");
  }, 30000);

  it("reconciles delayed payments without a second order and preserves refund state", async () => {
    const book = await prisma.book.create({ data: { name: "Delayed payment" } });
    const payment = await prisma.payment.create({ data: {} });
    const bookOrder = await prisma.bookOrder.create({ data: { quantity: 1, bookId: book.id, paymentId: payment.id } });
    const input = { bookOrderId: bookOrder.id, checkoutSessionId: "cs_delayed_test", paymentStatus: "PENDING" as const, total: 900, shippingCost: 100 };
    const pending = await finalizeBookOrder(prisma, input, id => `ORD-DELAYED-${id}`);
    const settled = await finalizeBookOrder(prisma, { ...input, paymentStatus: "SUCCEEDED" }, id => `ORD-DELAYED-${id}`);
    expect(settled.orderId).toBe(pending.orderId); expect(settled.newlyFinalized).toBeFalse();
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("SUCCEEDED");
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } });
    await finalizeBookOrder(prisma, { ...input, paymentStatus: "SUCCEEDED" }, id => `ORD-DELAYED-${id}`);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("REFUNDED");
    await expect((async () => { await finalizeBookOrder(prisma, { ...input, checkoutSessionId: "cs_wrong" }, id => `ORD-DELAYED-${id}`); })()).rejects.toThrow("does not match");
  });
});
