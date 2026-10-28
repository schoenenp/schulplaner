import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";

const env = {
  PATH: process.env.PATH,
  NODE_ENV: "production",
  AUTH_SECRET: "test-auth-secret",
  DATABASE_URL: "postgresql://app@127.0.0.1:9/shop",
  PRICING_DATABASE_URL: "postgresql://pricing@127.0.0.1:9/pricing",
  PRICING_API_TOKEN: "pricing-test-token-0123456789abcdef",
  EMAIL_SERVER_USER: "test",
  EMAIL_SERVER_PASSWORD: "test",
  EMAIL_SERVER_HOST: "127.0.0.1",
  EMAIL_FROM: "test@example.de",
  S3_BUCKET: "test",
  AWS_REGION: "test",
  S3_ENDPOINT: "https://storage.example.test",
  STRIPE_SECRET_KEY: "sk_test_pricing_fixture",
};
function validate(input: Record<string, string | undefined>) {
  return Bun.spawnSync(
    [process.execPath, "--no-env-file", "-e", 'await import("./src/env.js");'],
    {
      cwd: resolve(import.meta.dir, ".."),
      env: input,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
}
describe("panel pricing database configuration", () => {
  it("validates a separate database without connecting during the build", () => {
    expect(validate(env).exitCode).toBe(0);
  });
  it("requires PRICING_DATABASE_URL in production", () => {
    const result = validate({ ...env, PRICING_DATABASE_URL: undefined });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("PRICING_DATABASE_URL");
  });
  it("rejects the same database despite another username or URL spelling", () => {
    const result = validate({
      ...env,
      PRICING_DATABASE_URL: "postgres://pricing@localhost:9/shop",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain("andere Datenbank");
  });
});
