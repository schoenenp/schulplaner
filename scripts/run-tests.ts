import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const scope = process.argv[2] ?? "all";
if (!["all", "platform", "template-sharing"].includes(scope)) {
  throw new Error(`Unknown test scope: ${scope}`);
}
const sharingSuites = new Set([
  "src/server/api/routers/template-share.test.ts",
  "src/app/template/share/claim/route.test.ts",
  "src/server/auth/template-invitation.test.ts",
  "src/server/auth/origin-policy.test.ts",
]);
const workspaces =
  scope === "template-sharing"
    ? ["apps/genbooks"]
    : [
        "packages/storage",
        "packages/db",
        "packages/pricing",
        "apps/panel_books",
        "apps/genbooks",
        ...(scope === "all" ? ["packages/pdf-pipeline"] : []),
      ];

// One environment for every suite. Never load developer/production credentials.
const env = {
  PATH: process.env.PATH,
  NODE_ENV: "test",
  PRICING_TEST_DATABASE_URL: process.env.PRICING_TEST_DATABASE_URL,
  SKIP_ENV_VALIDATION: "1",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  AUTH_SECRET: "platform-test-auth",
  CANCEL_SECRET: "platform-test-cancel",
  PARTNER_LINK_SECRET: "platform-test-partner-secret",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:9/platform_test",
  EMAIL_SERVER_HOST: "127.0.0.1",
  EMAIL_SERVER_PORT: "9",
  EMAIL_SERVER_USER: "test",
  EMAIL_SERVER_PASSWORD: "test",
  EMAIL_FROM: "test@example.de",
  SHOP_EMAIL: "test@example.de",
  NEXT_PUBLIC_CDN_SERVER_URL: "https://cdn.example.de",
  NEXT_PUBLIC_STRIPE_PUSHABLE_KEY: "pk_test_placeholder",
  STRIPE_SUCCESS_URL: "https://app.example.de/payment/success",
  STRIPE_CANCEL_URL: "https://app.example.de/payment/cancel",
  AUTH_GOOGLE_ID: "test",
  AUTH_GOOGLE_SECRET: "test",
  S3_BUCKET: "books-test",
  AWS_REGION: "fsn1",
  S3_ENDPOINT: "https://fsn1.your-objectstorage.com",
  PARTNER_CONTROLLED_FULFILLMENT_ENABLED: "true",
};

let failed = false;
for (const workspace of workspaces) {
  const cwd = resolve(root, workspace);
  const files = [...new Bun.Glob("src/**/*.test.ts").scanSync({ cwd })].sort();
  for (const file of files) {
    if (scope === "template-sharing" && !sharingSuites.has(file)) continue;
    // Fresh processes prevent Bun's module mocks leaking between API suites.
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
