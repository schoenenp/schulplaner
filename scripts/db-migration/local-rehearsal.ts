import { SQL } from "bun";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Starts its own servers. Never connects to an existing local or remote database.
const directory = await mkdtemp(join(tmpdir(), "books-db-rehearsal-"));
const pgData = join(directory, "pg"), mysqlData = join(directory, "mysql"), socket = join(directory, "socket");
await Promise.all([mkdir(pgData), mkdir(mysqlData), mkdir(socket)]);
const environment = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LC_ALL: "C", LANG: "C" };
function freePort() {
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const port = listener.port; listener.stop(); return port;
}
const pgPort = freePort(), mysqlPort = freePort();
let pgStarted = false, mysql: ReturnType<typeof Bun.spawn> | undefined, passed = false;

async function command(args: string[]) {
  const child = Bun.spawn(args, { env: environment, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code) throw new Error(`${args[0]} failed (${code}): ${stderr || stdout}`);
}

try {
  for (const binary of ["initdb", "pg_ctl", "mysqld"]) if (!Bun.which(binary)) throw new Error(`Install local PostgreSQL and MySQL server tools; ${binary} is missing`);
  await command(["initdb", "-D", pgData, "-U", "migration", "--auth=trust", "--encoding=UTF8", "--locale=C.UTF-8"]);
  await command(["mysqld", "--no-defaults", "--initialize-insecure", `--datadir=${mysqlData}`]);
  await command(["pg_ctl", "-D", pgData, "-l", join(directory, "postgres.log"), "-o", `-p ${pgPort} -h 127.0.0.1 -k ${socket}`, "start"]);
  pgStarted = true;
  mysql = Bun.spawn(["mysqld", "--no-defaults", `--datadir=${mysqlData}`, `--port=${mysqlPort}`, "--bind-address=127.0.0.1", `--socket=${join(directory, "mysql.sock")}`, `--pid-file=${join(directory, "mysql.pid")}`, "--mysqlx=OFF"], {
    env: environment, stdout: Bun.file(join(directory, "mysql.log")), stderr: Bun.file(join(directory, "mysql-errors.log")),
  });
  const mysqlUrl = `mysql://root@127.0.0.1:${mysqlPort}/mysql`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const probe = new SQL(mysqlUrl, { connectionTimeout: 1, max: 1 });
    try { await probe.unsafe("SELECT 1"); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    finally { await probe.close({ timeout: 0 }); }
  }
  if (!ready) throw new Error("Disposable MySQL server did not become ready");
  console.log(`Running database rehearsal with isolated servers; logs: ${directory}`);
  const test = Bun.spawn([process.execPath, "--no-env-file", "test", "scripts/db-migration"], {
    cwd: resolve(import.meta.dir, "../.."),
    env: {
      ...environment,
      MIGRATION_TEST_MYSQL_ADMIN_URL: mysqlUrl,
      MIGRATION_TEST_POSTGRES_ADMIN_URL: `postgresql://migration@127.0.0.1:${pgPort}/postgres`,
    },
    stdout: "inherit", stderr: "inherit",
  });
  if (await test.exited) throw new Error("Database rehearsal tests failed");
  passed = true;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Local rehearsal failed");
  process.exitCode = 1;
} finally {
  if (mysql) { mysql.kill("SIGTERM"); await mysql.exited; }
  if (pgStarted) await command(["pg_ctl", "-D", pgData, "-m", "fast", "stop"]);
  if (passed) await rm(directory, { recursive: true, force: true });
  else console.error(`Rehearsal artifacts retained at ${directory}`);
}
