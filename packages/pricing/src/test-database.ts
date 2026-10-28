import { randomUUID } from "node:crypto";
import { Pool } from "pg";

/** Integration tests create and remove their own databases on a local server. */
export async function createTestDatabase() {
  const source = process.env.PRICING_TEST_DATABASE_URL;
  if (!source)
    throw new Error("Run bun run --cwd packages/pricing test:postgres first.");
  const url = new URL(source);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error(
      "Pricing integration tests only run against a local PostgreSQL server.",
    );
  }
  const name = `pricing_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: source, max: 1 });
  await admin.query(`CREATE DATABASE ${name}`);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.href, max: 1 });
  return {
    url: url.href,
    pool,
    async close() {
      await pool.end();
      try {
        await admin.query(`DROP DATABASE ${name}`);
      } finally {
        await admin.end();
      }
    },
  };
}
