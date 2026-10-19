import { afterEach, expect, it } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { GET } from "./app/api/health/route";

const original = process.env.DATABASE_MAINTENANCE_MODE;
afterEach(() => {
  if (original === undefined) delete process.env.DATABASE_MAINTENANCE_MODE;
  else process.env.DATABASE_MAINTENANCE_MODE = original;
});

it("blocks staff, auth and API requests during maintenance while preserving liveness", async () => {
  process.env.DATABASE_MAINTENANCE_MODE = "true";
  for (const path of ["/dashboard", "/api/auth/session", "/api/trpc/planner.list", "/api/module-files"]) {
    expect(proxy(new NextRequest(`https://panel.example.de${path}`)).status).toBe(503);
  }
  expect(proxy(new NextRequest("https://panel.example.de/api/health")).headers.get("x-middleware-next")).toBe("1");
  expect(await GET().json()).toEqual({ status: "ok", maintenance: true });
  process.env.DATABASE_MAINTENANCE_MODE = "false";
  expect(proxy(new NextRequest("https://panel.example.de/dashboard")).headers.get("x-middleware-next")).toBe("1");
});
