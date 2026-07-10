import { handlers } from "@/server/auth";
import { NextRequest } from "next/server";
import { getAuthOriginPolicyError } from "@/server/auth/origin-policy";
import { logger } from "@/util/logger";
import { getAllowedRequestAppOrigin } from "@/util/app-origin";

function normalizeAuthRequestOrigin(request: NextRequest) {
  const appOrigin = getAllowedRequestAppOrigin(request.headers);
  if (!appOrigin) return request;

  const currentUrl = new URL(request.url);
  const normalizedUrl = new URL(
    `${currentUrl.pathname}${currentUrl.search}`,
    appOrigin,
  );

  if (normalizedUrl.origin === currentUrl.origin) {
    return request;
  }

  return new NextRequest(normalizedUrl.toString(), request);
}

function rejectUnsafeAuthOrigin(request: NextRequest) {
  const error = getAuthOriginPolicyError(request.headers);
  if (!error) return null;

  logger.warn("auth_origin_policy_rejected", { error });
  return new Response("Invalid auth origin configuration.", {
    status: 400,
  });
}

export async function GET(request: NextRequest) {
  const rejected = rejectUnsafeAuthOrigin(request);
  if (rejected) return rejected;

  return handlers.GET(normalizeAuthRequestOrigin(request));
}

export async function POST(request: NextRequest) {
  const rejected = rejectUnsafeAuthOrigin(request);
  if (rejected) return rejected;

  return handlers.POST(normalizeAuthRequestOrigin(request));
}
