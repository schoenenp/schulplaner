import { NextResponse, type NextRequest } from "next/server";
import { getAppOriginFromHeaders } from "@/util/app-origin";
import { templateSharePath } from "@/util/template-share-navigation";

// Email scanners may GET or HEAD this URL. Opening it must not claim a
// planner, create an account, or replace the browser's signed-in identity.
export function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const path = token
    ? templateSharePath(token)
    : "/template/share?error=missing-token";
  return NextResponse.redirect(
    new URL(path, getAppOriginFromHeaders(request.headers)),
  );
}
