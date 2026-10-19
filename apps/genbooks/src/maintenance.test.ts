import { afterEach, expect, it } from "bun:test";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import { GET } from "./app/api/health/route";

const original = process.env.DATABASE_MAINTENANCE_MODE;
afterEach(() => {
  if (original === undefined) delete process.env.DATABASE_MAINTENANCE_MODE;
  else process.env.DATABASE_MAINTENANCE_MODE = original;
});

it("blocks page, GET auth, API and upload requests before their handlers during maintenance", () => {
  process.env.DATABASE_MAINTENANCE_MODE = "true";
  for (const path of ["/dashboard", "/api/auth/session", "/api/trpc/order.validate", "/api/cdn", "/api/module-files"]) {
    for (const method of ["GET", "POST"]) {
      const response = middleware(new NextRequest(`https://app.example.de${path}`, { method }));
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  }
});

it("keeps database-free liveness available and resumes normal routing when disabled", async () => {
  process.env.DATABASE_MAINTENANCE_MODE = "true";
  expect(middleware(new NextRequest("https://app.example.de/api/health")).headers.get("x-middleware-next")).toBe("1");
  expect(await GET().json()).toEqual({ status: "ok", maintenance: true });
  process.env.DATABASE_MAINTENANCE_MODE = "false";
  expect(middleware(new NextRequest("https://app.example.de/dashboard")).headers.get("x-middleware-next")).toBe("1");
});
