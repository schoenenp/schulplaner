import { NextResponse, type NextRequest } from "next/server";

// The price book is in a separate PostgreSQL database, so the shop can keep reading
// prices while the PostgreSQL database is in maintenance.
const MAINTENANCE_EXEMPT_PATHS = new Set(["/api/health", "/api/pricing"]);

export function proxy(request: NextRequest) {
  if (process.env.DATABASE_MAINTENANCE_MODE !== "true" || MAINTENANCE_EXEMPT_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  return new NextResponse("We’re performing scheduled maintenance. Please try again shortly.", {
    status: 503,
    headers: { "Cache-Control": "no-store", "Retry-After": "60", "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const config = { matcher: "/:path*" };
