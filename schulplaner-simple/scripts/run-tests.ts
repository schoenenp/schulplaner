import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const scope = process.argv[2] ?? "all";
if (!["all", "app", "pdf"].includes(scope)) {
  throw new Error(`Unknown test scope: ${scope}`);
}
const workspaces =
  scope === "pdf"
    ? ["packages/pdf-pipeline"]
    : scope === "app"
      ? ["packages/storage", "apps/web"]
      : ["packages/storage", "apps/web", "packages/pdf-pipeline"];

// One environment for every suite. Never load developer/production credentials.
const env = {
  PATH: process.env.PATH,
  NODE_ENV: "test",
  SKIP_ENV_VALIDATION: "1",
  AUTH_SECRET: "platform-test-auth",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:9/platform_test",
  EMAIL_FROM: "test@example.de",
  S3_BUCKET: "books-test",
  AWS_REGION: "fsn1",
  S3_ENDPOINT: "https://fsn1.your-objectstorage.com",
};

let failed = false;
for (const workspace of workspaces) {
  const cwd = resolve(root, workspace);
  const files = [...new Bun.Glob("src/**/*.test.ts").scanSync({ cwd })].sort();
  for (const file of files) {
    // Fresh processes prevent Bun's module mocks leaking between suites.
    const child = Bun.spawn([process.execPath, "--no-env-file", "test", file], {
      cwd,
      env,
      stdout: "inherit",
      stderr: "inherit",
    });
    if ((await child.exited) !== 0) failed = true;
  }
}
process.exit(failed ? 1 : 0);
