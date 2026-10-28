import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { randomBytes, pbkdf2Sync, createHmac, createHash } from "node:crypto";
const require = createRequire(import.meta.url);
const { Client } = require("pg");

const { values } = parseArgs({
  options: {
    "admin-file": { type: "string" },
    "password-file": { type: "string" },
    "output-file": { type: "string" },
    database: { type: "string" },
    role: { type: "string" },
    apply: { type: "boolean", default: false },
  },
});
function check(condition, message) {
  if (!condition) throw new Error(message);
}
function identifier(value) {
  check(
    typeof value === "string" && /^[a-z][a-z0-9_]{0,62}$/.test(value),
    "Database and role names must be lowercase SQL identifiers, at most 63 characters.",
  );
  return `"${value}"`;
}
function literal(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
// PostgreSQL SCRAM verifier: the plaintext password is never sent in SQL DDL.
function scram(password) {
  const salt = randomBytes(16);
  const salted = pbkdf2Sync(password, salt, 4096, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest("base64");
  const serverKey = createHmac("sha256", salted)
    .update("Server Key")
    .digest("base64");
  return `SCRAM-SHA-256$4096:${salt.toString("base64")}$${storedKey}:${serverKey}`;
}
const databaseName = values.database;
const roleName = values.role;
const database = identifier(databaseName);
const role = identifier(roleName);
check(values["admin-file"], "Provide a private admin connection file.");
let adminUrl;
try {
  adminUrl = new URL(readFileSync(values["admin-file"], "utf8").trim());
} catch {
  throw new Error(
    "The private administrator connection file must contain one PostgreSQL URL.",
  );
}
check(
  ["postgres:", "postgresql:"].includes(adminUrl.protocol) &&
    adminUrl.hostname &&
    adminUrl.pathname.slice(1),
  "The administrator URL must name the existing shop PostgreSQL database.",
);
check(
  decodeURIComponent(adminUrl.pathname.slice(1)) !== databaseName,
  "The pricing database must differ from the shop database.",
);
check(
  !["host", "port", "dbname", "database", "user", "password"].some((key) =>
    adminUrl.searchParams.has(key),
  ),
  "Use a standard URL with host, port, credentials and database in the URL authority/path.",
);
if (values.apply) {
  check(
    values["password-file"] && values["output-file"],
    "Apply requires private password and output files.",
  );
  check(
    !existsSync(values["output-file"]),
    "The private output file already exists; it will not be overwritten.",
  );
}
const admin = new Client({
  connectionString: adminUrl.href,
  connectionTimeoutMillis: 10000,
  statement_timeout: 15000,
  application_name: "pricing-setup",
});
let createdRole = false,
  createdDatabase = false,
  success = false;
try {
  await admin.connect();
  await admin.query(
    "SELECT pg_advisory_lock(hashtext('planner-pricing-setup'), hashtext($1))",
    [databaseName],
  );
  const {
    rows: [current],
  } = await admin.query(
    "SELECT current_database() AS database, current_user AS role, rolsuper FROM pg_roles WHERE rolname = current_user",
  );
  check(
    current.rolsuper,
    "Use a PostgreSQL cluster administrator to create and verify the restricted pricing login.",
  );
  const {
    rows: [shop],
  } = await admin.query(
    "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('Book', 'User')) AS found",
  );
  check(
    shop.found,
    "This URL does not point to the existing shop database; no changes were made.",
  );
  const {
    rows: [existing],
  } = await admin.query(
    "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS database, EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $2) AS role",
    [databaseName, roleName],
  );
  check(
    !existing.database && !existing.role,
    "The requested pricing database or role already exists; no changes were made.",
  );
  console.log(
    `Verified administrator access to the existing shop database. New pricing database: ${databaseName}; role: ${roleName}.`,
  );
  if (!values.apply) {
    console.log("Preflight only; no database or role was created.");
  } else {
    const password = readFileSync(values["password-file"], "utf8").replace(
      /\r?\n$/,
      "",
    );
    check(
      /^[\x20-\x7e]{24,}$/.test(password),
      "The new pricing password must contain at least 24 printable ASCII characters.",
    );
    await admin.query(
      `CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 12 PASSWORD ${literal(scram(password))}`,
    );
    createdRole = true;
    const {
      rows: [access],
    } = await admin.query(
      `SELECT
      has_database_privilege($1, current_database(), 'CREATE') OR
      EXISTS (SELECT 1 FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' AND has_schema_privilege($1, oid, 'CREATE')) OR
      EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND
        ((c.relkind IN ('r','p','v','m','f') AND (has_table_privilege($1, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege($1, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')))
        OR (c.relkind = 'S' AND has_sequence_privilege($1, c.oid, 'USAGE,SELECT,UPDATE')))) AS unsafe`,
      [roleName],
    );
    check(
      !access.unsafe,
      "The shop grants access through PUBLIC. Setup stopped without changing shop grants; a restricted pricing login needs a separate access review.",
    );
    await admin.query(
      `CREATE DATABASE ${database} OWNER ${role} TEMPLATE template0`,
    );
    createdDatabase = true;
    await admin.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
    const targetUrl = new URL(adminUrl.href);
    targetUrl.pathname = `/${databaseName}`;
    const targetAdmin = new Client({
      connectionString: targetUrl.href,
      connectionTimeoutMillis: 10000,
      statement_timeout: 15000,
    });
    try {
      await targetAdmin.connect();
      await targetAdmin.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
      await targetAdmin.query(`CREATE SCHEMA pricing AUTHORIZATION ${role}`);
    } finally {
      await targetAdmin.end();
    }
    await admin.query(`ALTER ROLE ${role} LOGIN`);
    const pricingUrl = new URL(targetUrl.href);
    pricingUrl.username = roleName;
    pricingUrl.password = encodeURIComponent(password);
    for (const key of ["schema", "options", "application_name"])
      pricingUrl.searchParams.delete(key);
    const pricingClient = new Client({
      connectionString: pricingUrl.href,
      connectionTimeoutMillis: 10000,
      statement_timeout: 15000,
    });
    try {
      await pricingClient.connect();
      const {
        rows: [permissions],
      } = await pricingClient.query(
        "SELECT current_database() AS database, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user",
      );
      check(
        permissions.database === databaseName &&
          !permissions.rolsuper &&
          !permissions.rolcreatedb &&
          !permissions.rolcreaterole,
        "The pricing login does not have the expected restricted privileges.",
      );
      await pricingClient.query("BEGIN");
      await pricingClient.query(
        "CREATE TABLE pricing.setup_verification (id INTEGER PRIMARY KEY)",
      );
      await pricingClient.query(
        "INSERT INTO pricing.setup_verification VALUES (1)",
      );
      await pricingClient.query("ROLLBACK");
    } finally {
      await pricingClient.end();
    }
    writeFileSync(
      values["output-file"],
      `PRICING_DATABASE_URL=${pricingUrl.href}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    success = true;
    console.log(
      "Created the pricing database, restricted login and pricing schema. Verified read/write access there and no existing shop-table privileges. No prices were seeded or overwritten; the database is ready for an import or the panel first start.",
    );
    console.log(
      "The new connection is saved in the specified private output file; no connection strings or passwords were logged.",
    );
  }
} catch (error) {
  // Only remove empty objects created by this invocation. Existing objects and
  // shop grants/tables are never changed by setup or its rollback.
  if (!success) {
    try {
      if (createdRole) await admin.query(`ALTER ROLE ${role} NOLOGIN`);
    } catch {}
    try {
      if (createdDatabase) await admin.query(`DROP DATABASE ${database}`);
    } catch {}
    try {
      if (createdRole) await admin.query(`DROP ROLE ${role}`);
    } catch {}
  }
  console.error(
    error?.code
      ? `Database setup failed (${error.code}); no credentials were logged.`
      : error.message,
  );
  process.exitCode = 1;
} finally {
  await admin.end();
}
