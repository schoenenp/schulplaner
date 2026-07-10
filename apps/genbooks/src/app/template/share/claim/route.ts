import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { TRPCError } from "@trpc/server";

import { db } from "@/server/db";
import { getRequestAppOrigin } from "@/util/app-origin";
import {
  claimTemplateShareForUser,
  hashTemplateShareToken,
  normalizeTemplateShareEmail,
} from "@/util/template-share";
import { logger } from "@/util/logger";

const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function getAppOrigin(request: NextRequest) {
  return getRequestAppOrigin(request.headers) ?? new URL(request.url).origin;
}

function getSessionCookieName(origin: string) {
  return new URL(origin).protocol === "https:"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

function redirectToSharePage(
  request: NextRequest,
  token: string | null,
  error?: string,
) {
  const url = new URL("/template/share", getAppOrigin(request));
  if (token) {
    url.searchParams.set("claim", token);
  }
  if (error) {
    url.searchParams.set("error", error);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) {
    return redirectToSharePage(request, null, "missing-token");
  }

  try {
    const tokenHash = hashTemplateShareToken(token);
    const share = await db.templateShare.findUnique({
      where: { tokenHash },
      select: {
        kind: true,
        recipientEmail: true,
        expiresAt: true,
        revokedAt: true,
        template: {
          select: {
            isTemplate: true,
            deletedAt: true,
          },
        },
      },
    });

    if (share?.kind !== "INVITE" || !share.recipientEmail) {
      return redirectToSharePage(request, token);
    }
    if (
      share.revokedAt ||
      share.expiresAt.getTime() < Date.now() ||
      !share.template.isTemplate ||
      share.template.deletedAt
    ) {
      return redirectToSharePage(request, token, "invalid-token");
    }

    const email = normalizeTemplateShareEmail(share.recipientEmail);
    const now = new Date();
    const user = await db.user.upsert({
      where: { email },
      update: { emailVerified: now },
      create: {
        email,
        emailVerified: now,
      },
      select: {
        id: true,
        email: true,
      },
    });

    const claim = await claimTemplateShareForUser(db, {
      token,
      userId: user.id,
      userEmail: user.email ?? email,
    });

    const sessionToken = crypto.randomUUID();
    const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
    await db.session.create({
      data: {
        sessionToken,
        userId: user.id,
        expires,
      },
    });

    const origin = getAppOrigin(request);
    const response = NextResponse.redirect(
      new URL(`/dashboard?claimedTemplate=${claim.bookId}`, origin),
    );
    response.cookies.set(getSessionCookieName(origin), sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: new URL(origin).protocol === "https:",
      maxAge: SESSION_MAX_AGE_SECONDS,
      expires,
    });

    return response;
  } catch (error) {
    logger.warn("template_share_direct_claim_failed", {
      error,
    });

    const normalizedError =
      error instanceof TRPCError && error.code === "BAD_REQUEST"
        ? "claim-failed"
        : "invalid-token";
    return redirectToSharePage(request, token, normalizedError);
  }
}
