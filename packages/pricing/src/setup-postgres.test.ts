import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "pg";
import { createTestDatabase } from "./test-database";
import { openPriceStore } from "./store";

describe.skipIf(!process.env.PRICING_TEST_DATABASE_URL)(
  "shared-server pricing setup",
  () => {
    let shop: Awaited<ReturnType<typeof createTestDatabase>>;
    let dir: string;
    let database: string;
    let role: string;
    beforeEach(async () => {
      shop = await createTestDatabase();
      dir = mkdtempSync(join(tmpdir(), "pricing-setup-"));
      const suffix = randomUUID().replaceAll("-", "");
      database = `pricing_data_${suffix}`;
      role = `pricing_user_${suffix}`;
      await shop.pool.query(
        'CREATE TABLE public."Book" (id INTEGER PRIMARY KEY); CREATE TABLE public."User" (id INTEGER PRIMARY KEY); INSERT INTO public."Book" VALUES (42)',
      );
      writeFileSync(join(dir, "admin.url"), shop.url, { mode: 0o600 });
      writeFileSync(
        join(dir, "password"),
        "local-fixture-%/:?@#'pricing-123456789",
        { mode: 0o600 },
      );
    });
    afterEach(async () => {
      await shop.pool.query(`DROP DATABASE IF EXISTS "${database}"`);
      await shop.pool.query(`DROP ROLE IF EXISTS "${role}"`);
      await shop.close();
      rmSync(dir, { recursive: true, force: true });
    });
    function run(apply = false) {
      return Bun.spawnSync(
        [
          process.execPath,
          "--no-env-file",
          resolve(import.meta.dir, "../scripts/setup-postgres.mjs"),
          "--admin-file",
          join(dir, "admin.url"),
          "--password-file",
          join(dir, "password"),
          "--output-file",
          join(dir, "pricing.env"),
          "--database",
          database,
          "--role",
          role,
          ...(apply ? ["--apply"] : []),
        ],
        { env: { PATH: process.env.PATH }, stdout: "pipe", stderr: "pipe" },
      );
    }
    it("provisions a usable pricing store with no shop-table access, and refuses overwrites", async () => {
      const preflight = run();
      expect(preflight.exitCode).toBe(0);
      expect(
        (
          await shop.pool.query(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            [database],
          )
        ).rowCount,
      ).toBe(0);
      const applied = run(true);
      expect(applied.stderr.toString()).toBe("");
      expect(applied.exitCode).toBe(0);
      const privateFile = join(dir, "pricing.env");
      expect(statSync(privateFile).mode & 0o777).toBe(0o600);
      const url = readFileSync(privateFile, "utf8")
        .trim()
        .slice("PRICING_DATABASE_URL=".length);
      const store = await openPriceStore(url, {
        applicationDatabaseUrl: shop.url,
      });
      try {
        expect((await store.current()).id).toBe(1);
      } finally {
        await store.close();
      }
      const shopUrl = new URL(url);
      shopUrl.pathname = new URL(shop.url).pathname;
      const restricted = new Client({ connectionString: shopUrl.href });
      try {
        await restricted.connect();
        await expect(
          restricted.query('SELECT * FROM public."Book"'),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          restricted.query("CREATE TABLE public.setup_must_fail (id INTEGER)"),
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await restricted.end();
      }
      expect(run(true).exitCode).not.toBe(0);
      expect(
        (await shop.pool.query('SELECT id FROM public."Book"')).rows,
      ).toEqual([{ id: 42 }]);
    });
    it("rolls back its own role if PUBLIC grants would expose shop data", async () => {
      await shop.pool.query('GRANT SELECT ON public."Book" TO PUBLIC');
      const result = run(true);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr.toString()).toContain("PUBLIC");
      expect(existsSync(join(dir, "pricing.env"))).toBe(false);
      expect(
        (
          await shop.pool.query(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            [database],
          )
        ).rowCount,
      ).toBe(0);
      expect(
        (
          await shop.pool.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [
            role,
          ])
        ).rowCount,
      ).toBe(0);
      expect(
        (await shop.pool.query('SELECT id FROM public."Book"')).rows,
      ).toEqual([{ id: 42 }]);
    });
  },
);
