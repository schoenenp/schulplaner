import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  if (process.env.DATABASE_MAINTENANCE_MODE !== "true" || request.nextUrl.pathname === "/api/health") {
    return NextResponse.next();
  }
  return new NextResponse("We’re performing scheduled maintenance. Please try again shortly.", {
    status: 503,
    headers: { "Cache-Control": "no-store", "Retry-After": "60", "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const config = { matcher: "/:path*" };
