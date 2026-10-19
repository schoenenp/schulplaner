import { SQL, type TransactionSQL } from "bun";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import rawManifest from "./manifest.json";
import { canonicalJson, normalizeValue } from "./canonical";

export type Column = { name: string; type: string; pgType: string; dbDefault: string | null; required: boolean; values?: string[]; autoIncrement?: boolean; sourceDefault?: string };
export type Reference = { columns: string[]; table: string; targets: string[]; onDelete: string; onUpdate: string };
export type Table = { name: string; columns: Column[]; keys: string[]; uniques: string[][]; references: Reference[] };
export type Row = Record<string, string | null>;
export const manifest = rawManifest as { version: number; schemaSha256: string; migrationSha256: string; targetIndexes: Array<{ name: string; table: string; columns: string[] }>; tables: Table[] };
export type Database = Pick<SQL, "unsafe">;
export type Engine = "mysql" | "postgresql";
export const digest = (text: string) => createHash("sha256").update(text).digest("hex");
export const quote = (name: string, engine: Engine) => engine === "mysql"
  ? `\`${name.replaceAll("`", "``")}\`` : `"${name.replaceAll('"', '""')}"`;

export async function checkManifest() {
  const actual = digest(await Bun.file(resolve(import.meta.dir, "../../packages/db/prisma/schema.prisma")).text());
  if (actual !== manifest.schemaSha256) throw new Error("Schema changed: regenerate and review the migration manifest first");
  const migration = digest(await Bun.file(resolve(import.meta.dir, "../../packages/db/prisma/migrations/0_postgresql_init/migration.sql")).text());
  if (migration !== manifest.migrationSha256) throw new Error("Initial migration changed: regenerate and review the manifest first");
}

export function connect(url: string, engine: Engine) {
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { throw new Error("Invalid database URL; connection details omitted"); }
  if (!(engine === "mysql" ? ["mysql:"] : ["postgres:", "postgresql:"]).includes(parsed.protocol)) {
    throw new Error(`Expected a ${engine} connection URL`);
  }
  if (engine === "postgresql" && parsed.searchParams.has("schema") && parsed.searchParams.get("schema") !== "public") throw new Error("The migration baseline targets the public PostgreSQL schema");
  return new SQL(url, { max: 1, idleTimeout: 0, maxLifetime: 0, connectionTimeout: 15 });
}

export async function identity(db: Database, engine: Engine, expected: string) {
  const rows = await db.unsafe(engine === "mysql"
    ? "SELECT DATABASE() AS name, VERSION() AS version, @@hostname AS host, @@port AS port, @@session.time_zone AS timezone, @@session.sql_mode AS sql_mode, @@auto_increment_increment AS increment_value, @@auto_increment_offset AS offset_value"
    : "SELECT current_database() AS name, version() AS version, inet_server_addr()::text AS host, inet_server_port()::text AS port, current_setting('TimeZone') AS timezone");
  const result = rows[0];
  if (!result || result.name !== expected) throw new Error(`Connected ${engine} database does not match the expected database name`);
  if (engine === "mysql" && (Number(result.increment_value) !== 1 || Number(result.offset_value) !== 1)) {
    throw new Error("Nonstandard MySQL auto-increment settings require a reviewed sequence mapping");
  }
  return result;
}

export async function snapshot<T>(sql: SQL, engine: Engine, run: (db: TransactionSQL) => Promise<T>) {
  if (engine === "mysql") {
    await sql.unsafe("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await sql.unsafe("SET SESSION time_zone = '+00:00'");
    await sql.unsafe("SET NAMES utf8mb4");
    return sql.begin("READ ONLY", run);
  }
  return sql.begin("ISOLATION LEVEL REPEATABLE READ READ ONLY", async db => {
    await db.unsafe("SET LOCAL TIME ZONE 'UTC'");
    await db.unsafe("SET LOCAL search_path = pg_catalog, public");
    return run(db);
  });
}

export async function inventory(db: Database, engine: Engine) {
  const tableRows = await db.unsafe(engine === "mysql"
    ? "SELECT TABLE_NAME AS name, TABLE_TYPE AS kind, ENGINE AS engine, AUTO_INCREMENT AS next_id, TABLE_COLLATION AS collation_name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME"
    : "SELECT c.relname AS name, CASE WHEN c.relkind = 'r' THEN 'BASE TABLE' ELSE c.relkind::text END AS kind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f') ORDER BY c.relname");
  const expectedNames = new Set(manifest.tables.map(t => t.name));
  const actualNames = new Set<string>(tableRows.map((t: { name: string }) => t.name));
  const unknown = [...actualNames].filter(name => !expectedNames.has(name) && name !== "_prisma_migrations");
  const missing = [...expectedNames].filter(name => !actualNames.has(name));
  if (unknown.length || missing.length) throw new Error(`Table inventory mismatch: unexpected [${unknown.join(", ")}], missing [${missing.join(", ")}]`);
  if (tableRows.some((t: { name: string; kind: string; engine?: string }) => expectedNames.has(t.name) && (t.kind !== "BASE TABLE" || (engine === "mysql" && t.engine !== "InnoDB")))) {
    throw new Error("All application objects must be base tables; MySQL snapshot requires InnoDB");
  }
  const columnRows = await db.unsafe(engine === "mysql"
    ? "SELECT TABLE_NAME AS table_name, COLUMN_NAME AS name, DATA_TYPE AS data_type, COLUMN_TYPE AS native_type, IS_NULLABLE AS nullable, COLLATION_NAME AS collation_name, EXTRA AS extra, COLUMN_DEFAULT AS default_value, DATETIME_PRECISION AS datetime_precision FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION"
    : "SELECT table_name, column_name AS name, data_type, udt_name AS native_type, is_nullable AS nullable, collation_name, column_default AS default_value, datetime_precision FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position");
  for (const table of manifest.tables) {
    const actual = columnRows.filter((c: { table_name: string }) => c.table_name === table.name);
    const columns = table.columns.filter(c => engine !== "mysql" || c.sourceDefault === undefined);
    if (actual.length !== columns.length || columns.some(c => !actual.some((a: { name: string }) => a.name === c.name))) {
      throw new Error(`Column inventory mismatch in ${table.name}; preserve and explicitly map schema drift first`);
    }
    for (const column of columns) {
      const live = actual.find((a: { name: string }) => a.name === column.name)!;
      if ((live.nullable === "NO") !== column.required) throw new Error(`Nullability drift in ${table.name}.${column.name}`);
      const allowed: Record<string, string[]> = engine === "mysql"
        ? { String: ["varchar", "text"], Int: ["int"], Boolean: ["tinyint"], DateTime: ["datetime"], Json: ["json"], Enum: ["enum"] }
        : Object.fromEntries(["String", "Int", "Boolean", "DateTime", "Json", "Enum"].map(type => [type, [column.pgType]]));
      if (!allowed[column.type]?.includes(engine === "mysql" ? live.data_type : live.native_type)) {
        throw new Error(`Type drift in ${table.name}.${column.name}`);
      }
      if (engine === "mysql" && Boolean(live.extra?.includes("auto_increment")) !== Boolean(column.autoIncrement)) {
        throw new Error(`Auto-increment drift in ${table.name}.${column.name}`);
      }
      if (column.type === "DateTime" && Number(live.datetime_precision) !== 3) throw new Error(`Timestamp precision drift in ${table.name}.${column.name}`);
      if (engine === "mysql" && column.type === "Enum" && live.native_type !== `enum(${column.values!.map(value => `'${value}'`).join(",")})`) throw new Error(`Enum drift in ${table.name}.${column.name}`);
      if (engine === "postgresql") {
        const actualDefault: string | null = live.default_value;
        const literal = actualDefault?.match(/^'((?:[^']|'')*)'::.+$/)?.[1]?.replaceAll("''", "'");
        const normalized = literal ?? actualDefault?.replace(/^\((.*)\)$/, "$1") ?? null;
        const matches = column.dbDefault === "__sequence__" ? actualDefault?.startsWith("nextval(")
          : column.dbDefault === "__now__" ? actualDefault === "CURRENT_TIMESTAMP"
          : normalized === column.dbDefault;
        if (!matches) throw new Error(`Target default drift in ${table.name}.${column.name}`);
      }
      if (engine === "postgresql" && column.type === "Enum") {
        const labels = await db.unsafe("SELECT enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname=$1 ORDER BY enumsortorder", [live.native_type]);
        if (JSON.stringify(labels.map((r: { label: string }) => r.label)) !== JSON.stringify(column.values)) throw new Error(`Enum drift in ${table.name}.${column.name}`);
      }
    }
  }
  const foreignKeys = await db.unsafe(engine === "mysql"
    ? "SELECT k.TABLE_NAME AS table_name, k.COLUMN_NAME AS column_name, k.REFERENCED_TABLE_NAME AS target_table, k.REFERENCED_COLUMN_NAME AS target_column, r.DELETE_RULE AS delete_rule, r.UPDATE_RULE AS update_rule FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL"
    : "SELECT c.relname AS table_name, a.attname AS column_name, ct.relname AS target_table, at.attname AS target_column, con.convalidated AS validated, con.condeferrable AS deferrable, con.confdeltype AS delete_rule, con.confupdtype AS update_rule FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class ct ON ct.oid=con.confrelid CROSS JOIN LATERAL unnest(con.conkey,con.confkey) AS keys(source_key,target_key) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=keys.source_key JOIN pg_attribute at ON at.attrelid=ct.oid AND at.attnum=keys.target_key WHERE con.contype='f' AND n.nspname='public'");
  const rule = (action: string) => engine === "mysql" ? action.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase()
    : ({ Cascade: "c", Restrict: "r", SetNull: "n", NoAction: "a" }[action]);
  const expectedFKs = manifest.tables.flatMap(t => t.references.flatMap(r => r.columns.map((column, i) => ({
    table_name: t.name, column_name: column, target_table: r.table, target_column: r.targets[i], delete_rule: rule(r.onDelete), update_rule: rule(r.onUpdate),
  }))));
  const fkKey = (r: Record<string, unknown>) => JSON.stringify([r.table_name, r.column_name, r.target_table, r.target_column, r.delete_rule, r.update_rule]);
  if (foreignKeys.length !== expectedFKs.length || expectedFKs.some(f => !foreignKeys.some((live: Record<string, unknown>) => fkKey(live) === fkKey(f)))) {
    throw new Error(`${engine} foreign keys or referential actions differ from the manifest`);
  }
  if (engine === "postgresql") {
    const invalid = await db.unsafe("SELECT count(*)::text AS count FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated");
    const triggers = await db.unsafe("SELECT count(*)::text AS count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND t.tgenabled <> 'O'");
    if (invalid[0].count !== "0" || triggers[0].count !== "0") throw new Error("Target has invalid constraints or disabled triggers");
  }
  const indexes = await db.unsafe(engine === "mysql"
    ? "SELECT TABLE_NAME AS table_name, INDEX_NAME AS name, NON_UNIQUE AS non_unique, SEQ_IN_INDEX AS position, COLUMN_NAME AS column_name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX"
    : "SELECT tablename AS table_name, indexname AS name, indexdef AS definition FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname");
  const uniqueIndexes = await db.unsafe(engine === "mysql"
    ? "SELECT TABLE_NAME AS table_name, INDEX_NAME AS name, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS columns_list FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND NON_UNIQUE=0 GROUP BY TABLE_NAME,INDEX_NAME"
    : "SELECT c.relname AS table_name, i.relname AS name, string_agg(a.attname, ',' ORDER BY k.position) AS columns_list FROM pg_index ix JOIN pg_class c ON c.oid=ix.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class i ON i.oid=ix.indexrelid CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY k(attnum,position) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum WHERE n.nspname='public' AND ix.indisunique AND ix.indisvalid AND ix.indpred IS NULL AND ix.indexprs IS NULL AND k.position <= ix.indnkeyatts GROUP BY c.relname,i.relname");
  for (const table of manifest.tables) {
    const actual = uniqueIndexes.filter((i: { table_name: string }) => i.table_name === table.name).map((i: { columns_list: string }) => i.columns_list);
    const expected = table.uniques.map(columns => columns.join(","));
    if (actual.length !== expected.length || expected.some(columns => !actual.includes(columns))) throw new Error(`Unique constraint drift in ${table.name}`);
  }
  if (engine === "postgresql") {
    const catalogIndexes = await db.unsafe("SELECT c.relname AS table_name, i.relname AS name, string_agg(a.attname, ',' ORDER BY k.position) AS columns_list, ix.indisvalid AS valid, ix.indisready AS ready FROM pg_index ix JOIN pg_class c ON c.oid=ix.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class i ON i.oid=ix.indexrelid CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY k(attnum,position) JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum WHERE n.nspname='public' AND ix.indpred IS NULL AND ix.indexprs IS NULL AND k.position <= ix.indnkeyatts GROUP BY c.relname,i.relname,ix.indisvalid,ix.indisready");
    for (const expected of manifest.targetIndexes) {
      if (!catalogIndexes.some((i: Record<string, unknown>) => i.table_name === expected.table && i.name === expected.name && i.columns_list === expected.columns.join(",") && i.valid && i.ready)) throw new Error(`Target index missing or invalid: ${expected.name}`);
    }
  }
  let customObjects: unknown[] = [];
  if (engine === "mysql") {
    customObjects = await db.unsafe("SELECT 'trigger' AS kind, TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() UNION ALL SELECT 'routine' AS kind, ROUTINE_NAME AS name FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE() UNION ALL SELECT 'event' AS kind, EVENT_NAME AS name FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE()");
    if (customObjects.length) throw new Error("Custom MySQL triggers, routines or events require an explicit migration mapping");
  }
  return {
    tables: tableRows, columns: columnRows, foreignKeys, indexes, uniqueIndexes, customObjects,
    ...(engine === "mysql" ? { metadataScope: "Objects visible to this account; review a complete DBA schema export before applying a copy" } : {}),
  };
}

function selectColumns(table: Table, engine: Engine) {
  return table.columns.map(c => {
    const name = quote(c.name, engine);
    if (engine === "mysql" && c.sourceDefault !== undefined) {
      return `'${c.sourceDefault.replaceAll("'", "''")}' AS ${name}`;
    }
    const expression = c.type === "DateTime"
      ? engine === "mysql" ? `DATE_FORMAT(${name}, '%Y-%m-%d %H:%i:%s.%f')` : `to_char(${name}, 'YYYY-MM-DD HH24:MI:SS.US')`
      : engine === "mysql" ? `CAST(${name} AS CHAR CHARACTER SET utf8mb4)` : `${name}::text`;
    return `${expression} AS ${name}`;
  }).join(", ");
}

export async function* batches(db: Database, table: Table, engine: Engine, size = 500): AsyncGenerator<Row[]> {
  let cursor: string[] | undefined;
  const expressions = table.keys.map(k => engine === "mysql"
    ? `CAST(CAST(${quote(k, engine)} AS CHAR CHARACTER SET utf8mb4) AS BINARY)`
    : `convert_to(${quote(k, engine)}::text, 'UTF8')`);
  while (true) {
    const params = cursor ?? [];
    const placeholders = params.map((_, i) => engine === "mysql" ? "CAST(? AS BINARY)" : `convert_to($${i + 1}::text, 'UTF8')`);
    const where = cursor ? ` WHERE (${expressions.join(", ")}) > (${placeholders.join(", ")})` : "";
    const raw = await db.unsafe(`SELECT ${selectColumns(table, engine)} FROM ${quote(table.name, engine)}${where} ORDER BY ${expressions.join(", ")} LIMIT ${size}`, params);
    if (!raw.length) break;
    const rows = raw.map((r: Record<string, unknown>) => Object.fromEntries(table.columns.map(c => {
      try { return [c.name, normalizeValue(c.type, r[c.name], c.required, c.values)]; }
      catch { throw new Error(`Cannot preserve a value in ${table.name}.${c.name} (key digest ${digest(JSON.stringify(table.keys.map(k => r[k])))}); resolve it before migration`); }
    })) as Row);
    yield rows;
    cursor = table.keys.map(k => rows[rows.length - 1]![k]!);
  }
}

export function rowDigest(table: Table, row: Row) {
  return digest(JSON.stringify(table.columns.map(c => [c.type, row[c.name] === null ? null : c.type === "Json" ? canonicalJson(row[c.name]!) : row[c.name]])));
}

export async function fingerprints(db: Database, engine: Engine) {
  const tables: Record<string, { count: number; sha256: string }> = {};
  for (const table of manifest.tables) {
    const hash = createHash("sha256"); let count = 0;
    for await (const rows of batches(db, table, engine)) {
      for (const row of rows) { hash.update(rowDigest(table, row) + "\n"); count++; }
    }
    const total = await db.unsafe(`SELECT CAST(COUNT(*) AS ${engine === "mysql" ? "CHAR" : "text"}) AS total FROM ${quote(table.name, engine)}`);
    if (BigInt(total[0].total) !== BigInt(count)) throw new Error(`Stable-key scan failed to cover all rows in ${table.name}`);
    tables[table.name] = { count, sha256: hash.digest("hex") };
  }
  return tables;
}

export function copyOrder() {
  const remaining = [...manifest.tables]; const ordered: Table[] = [];
  while (remaining.length) {
    const ready = remaining.findIndex(t => t.references.every(r => r.table === t.name || ordered.some(parent => parent.name === r.table)));
    if (ready < 0) throw new Error("Unexpected foreign-key dependency cycle");
    ordered.push(remaining.splice(ready, 1)[0]!);
  }
  return ordered;
}

export async function insertBatch(db: Database, table: Table, rows: Row[]) {
  const params: Array<string | null> = [];
  const groups = rows.map(row => `(${table.columns.map(c => {
    params.push(table.name === "Book" && c.name === "copyFromId" ? null : row[c.name]!);
    // Bind as text, then let PostgreSQL perform the reviewed type conversion.
    // In particular, a JSON document must not become a JSON-encoded JS string.
    return `$${params.length}::text::${quote(c.pgType, "postgresql")}`;
  }).join(",")})`);
  await db.unsafe(`INSERT INTO ${quote(table.name, "postgresql")} (${table.columns.map(c => quote(c.name, "postgresql")).join(",")}) VALUES ${groups.join(",")}`, params);
}

export async function sequenceMinimums(source: Database) {
  const result: Record<string, string> = {};
  for (const table of manifest.tables.filter(t => t.columns.some(c => c.autoIncrement))) {
    const column = table.columns.find(c => c.autoIncrement)!;
    const rows = await source.unsafe(`SELECT CAST(COALESCE(MAX(${quote(column.name, "mysql")}),0) + 1 AS CHAR) AS next_id FROM ${quote(table.name, "mysql")}`);
    const metadata = await source.unsafe("SELECT CAST(AUTO_INCREMENT AS CHAR) AS next_id FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?", [table.name]);
    const next = BigInt(metadata[0].next_id ?? "1") > BigInt(rows[0].next_id) ? BigInt(metadata[0].next_id) : BigInt(rows[0].next_id);
    if (next > 2147483647n) throw new Error(`Sequence capacity exhausted in ${table.name}`);
    result[table.name] = next.toString();
  }
  return result;
}

export async function compare(source: Database, target: Database) {
  const sourceHashes = await fingerprints(source, "mysql");
  const targetHashes = await fingerprints(target, "postgresql");
  const differences: Array<{ table: string; keySha256: string; columns: string[] }> = [];
  for (const table of manifest.tables) {
    if (JSON.stringify(sourceHashes[table.name]) === JSON.stringify(targetHashes[table.name])) continue;
    // Merge the two independent sorted scans; keep only bounded diagnostics.
    const flatten = async function* (db: Database, engine: Engine) { for await (const rows of batches(db, table, engine)) yield* rows; };
    const a = flatten(source, "mysql"), b = flatten(target, "postgresql");
    let x = await a.next(), y = await b.next();
    const key = (r: Row) => table.keys.map(k => r[k]!);
    const keyCompare = (left: string[], right: string[]) => {
      for (let i = 0; i < left.length; i++) { const n = Buffer.compare(Buffer.from(left[i]!), Buffer.from(right[i]!)); if (n) return n; }
      return 0;
    };
    while (!x.done || !y.done) {
      const ordering = x.done ? 1 : y.done ? -1 : keyCompare(key(x.value), key(y.value));
      const columns = ordering ? [ordering < 0 ? "missing_target_row" : "unexpected_target_row"]
        : table.columns.filter(c => digest(c.type === "Json" && x.value![c.name] !== null ? canonicalJson(x.value![c.name]!) : JSON.stringify(x.value![c.name])) !== digest(c.type === "Json" && y.value![c.name] !== null ? canonicalJson(y.value![c.name]!) : JSON.stringify(y.value![c.name]))).map(c => c.name);
      if (columns.length && differences.length < 100) differences.push({ table: table.name, keySha256: digest(JSON.stringify(key(ordering <= 0 ? x.value! : y.value!))), columns });
      if (ordering <= 0) x = await a.next();
      if (ordering >= 0) y = await b.next();
    }
  }
  const minimums = await sequenceMinimums(source);
  const sequences: Record<string, { minimum: string; next: string }> = {};
  for (const [name, minimum] of Object.entries(minimums)) {
    const sequence = await target.unsafe("SELECT pg_get_serial_sequence($1, 'id') AS name", [quote(name, "postgresql")]);
    if (!sequence[0].name) throw new Error(`Missing sequence for ${name}`);
    const rows = await target.unsafe(`SELECT last_value::text AS value, is_called FROM ${sequence[0].name}`);
    const next = BigInt(rows[0].value) + (rows[0].is_called ? 1n : 0n);
    sequences[name] = { minimum, next: next.toString() };
    if (next < BigInt(minimum)) differences.push({ table: name, keySha256: "sequence", columns: ["next_id_too_low"] });
  }
  const passed = manifest.tables.every(t => JSON.stringify(sourceHashes[t.name]) === JSON.stringify(targetHashes[t.name])) && !differences.length;
  return { passed, source: sourceHashes, target: targetHashes, sequences, differences };
}

export function options(args = process.argv.slice(2)) {
  const values = new Map<string, string>(); const flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const name = args[i]!;
    if (["--apply", "--source-frozen", "--target-isolated", "--source-metadata-reviewed"].includes(name)) flags.add(name);
    else if (["--expect-source", "--expect-target", "--report"].includes(name) && args[i + 1] && !args[i + 1]!.startsWith("--")) values.set(name, args[++i]!);
    else throw new Error(`Unknown or incomplete argument ${name}`);
  }
  const sourceUrl = process.env.MYSQL_SOURCE_URL;
  if (!sourceUrl || !values.get("--expect-source")) throw new Error("Set MYSQL_SOURCE_URL and --expect-source; application DATABASE_URL is deliberately not used");
  const sourceName = values.get("--expect-source")!;
  const targetName = values.get("--expect-target");
  const targetUrl = process.env.POSTGRES_TARGET_URL;
  if (targetUrl && !targetName) throw new Error("POSTGRES_TARGET_URL requires --expect-target");
  return { sourceUrl, sourceName, targetUrl, targetName, flags, report: values.get("--report") };
}

export async function writeReport(path: string | undefined, report: unknown) {
  if (!path) throw new Error("--report is required to preserve migration evidence");
  const file = Bun.file(path);
  if (await file.exists()) throw new Error("Report already exists; choose a fresh path to preserve previous evidence");
  const { open } = await import("node:fs/promises");
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(report, null, 2) + "\n"); } finally { await handle.close(); }
}

export async function main(run: () => Promise<void>) {
  try { await checkManifest(); await run(); }
  catch (error) {
    // Driver errors can include connection passwords or rejected row contents.
    console.error(error instanceof Error && !("errno" in error) && !("code" in error) ? error.message : "Database operation failed; inspect server diagnostics privately");
    process.exitCode = 1;
  }
}
