import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createServer } from "node:net";

// Never loads a developer .env or connects to an existing database. Requires
// the PostgreSQL server tools (initdb, pg_ctl and createdb) on PATH.
const root = resolve(import.meta.dir, "../../..");
const dir = mkdtempSync(join(tmpdir(), "pricing-pg-"));
const data = join(dir, "data");
const server = createServer();
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string")
  throw new Error("No local test port");
const port = address.port;
await new Promise<void>((resolve) => server.close(() => resolve()));
const env = {
  PATH: process.env.PATH,
  LC_ALL: "C",
  LANG: "C",
  TMPDIR: tmpdir(),
};
let started = false;
function run(cmd: string[]) {
  const result = Bun.spawnSync(cmd, { env, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode)
    throw new Error(
      `${cmd[0]} failed. Install PostgreSQL server tools and run as a non-root user.\n${result.stderr}`,
    );
}
try {
  run([
    "initdb",
    "-D",
    data,
    "-U",
    "pricing_test",
    "--auth=trust",
    "--no-locale",
    "--encoding=UTF8",
  ]);
  run([
    "pg_ctl",
    "-D",
    data,
    "-l",
    join(dir, "server.log"),
    "-o",
    `-h 127.0.0.1 -p ${port} -k ${dir}`,
    "-w",
    "start",
  ]);
  started = true;
  run([
    "createdb",
    "-h",
    "127.0.0.1",
    "-p",
    String(port),
    "-U",
    "pricing_test",
    "pricing_test",
  ]);
  const child = Bun.spawn(
    [process.execPath, "--no-env-file", "scripts/run-tests.ts"],
    {
      cwd: root,
      env: {
        ...env,
        PRICING_TEST_DATABASE_URL: `postgresql://pricing_test@127.0.0.1:${port}/pricing_test`,
      },
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  process.exitCode = await child.exited;
} finally {
  if (started) run(["pg_ctl", "-D", data, "-m", "fast", "-w", "stop"]);
  rmSync(dir, { recursive: true, force: true });
}
