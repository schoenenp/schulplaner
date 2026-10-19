import { z } from "zod";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { canToggleTemplateByRole } from "./book-template-access";
import {
  claimTemplateShareForUser,
  createTemplateInviteEmail,
  createTemplateShareToken,
  getTemplateShareExpiry,
  hashTemplateShareToken,
  normalizeTemplateShareEmail,
} from "@/util/template-share";
import { buildAppUrl, getAppOriginFromHeaders } from "@/util/app-origin";
import { sendTemplateInvitation } from "@/util/template-invitation-email";
import { templateSharePath } from "@/util/template-share-navigation";
import { logger } from "@/util/logger";
import { maskEmail } from "@/util/partner-claim";
import { enforceProcedureRateLimit } from "@/util/rate-limit";

const SHARE_VALID_DAYS_SCHEMA = z.number().int().min(1).max(365).optional();

async function assertShareableTemplate(
  ctx: {
    db: {
      book: {
        findFirst: (args: {
          where: {
            id: string;
            createdById: string;
            isTemplate: true;
            deletedAt: null;
          };
          select: {
            id: true;
            name: true;
            bookTitle: true;
            isTemplate: true;
          };
        }) => Promise<{
          id: string;
          name: string | null;
          bookTitle: string | null;
          isTemplate: boolean;
        } | null>;
      };
    };
    session: {
      user: {
        id: string;
        role: "ADMIN" | "STAFF" | "MODERATOR" | "USER" | "SPONSOR" | "PARTNER";
      };
    };
  },
  templateId: string,
) {
  if (!canToggleTemplateByRole(ctx.session.user.role)) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Template-Freigaben sind nur fuer berechtigte Rollen moeglich.",
    });
  }

  const template = await ctx.db.book.findFirst({
    where: {
      id: templateId,
      createdById: ctx.session.user.id,
      isTemplate: true,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      bookTitle: true,
      isTemplate: true,
    },
  });

  if (!template) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Aktive Vorlage wurde nicht gefunden.",
    });
  }

  return template;
}

async function createShareRecord(params: {
  ctx: {
    db: {
      templateShare: {
        create: (args: {
          data: {
            templateId: string;
            createdById: string;
            kind: "LINK" | "INVITE";
            recipientEmail?: string;
            tokenHash: string;
            expiresAt: Date;
          };
        }) => Promise<{ id: string }>;
      };
    };
    session: { user: { id: string } };
  };
  templateId: string;
  kind: "LINK" | "INVITE";
  recipientEmail?: string;
  expiresAt: Date;
}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = createTemplateShareToken();
    const tokenHash = hashTemplateShareToken(token);

    try {
      const share = await params.ctx.db.templateShare.create({
        data: {
          templateId: params.templateId,
          createdById: params.ctx.session.user.id,
          kind: params.kind,
          recipientEmail: params.recipientEmail,
          tokenHash,
          expiresAt: params.expiresAt,
        },
      });
      return { token, shareId: share.id };
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
      if (code !== "P2002") {
        throw error;
      }
    }
  }

  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Template-Link konnte nicht erstellt werden.",
  });
}

export const templateShareRouter = createTRPCRouter({
  createLink: protectedProcedure
    .input(
      z.object({
        templateId: z.string().min(1),
        validForDays: SHARE_VALID_DAYS_SCHEMA,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "template.share.link",
        maxRequests: 20,
        windowMs: 10 * 60 * 1000,
      });

      const template = await assertShareableTemplate(ctx, input.templateId);
      const expiresAt = getTemplateShareExpiry("LINK", input.validForDays);
      const origin = getAppOriginFromHeaders(ctx.headers);
      const { token } = await createShareRecord({
        ctx,
        templateId: template.id,
        kind: "LINK",
        expiresAt,
      });
      const shareUrl = buildAppUrl(origin, templateSharePath(token));

      return {
        token,
        shareUrl,
        expiresAt,
      };
    }),

  sendInvite: protectedProcedure
    .input(
      z.object({
        templateId: z.string().min(1),
        email: z.string().trim().email(),
        validForDays: SHARE_VALID_DAYS_SCHEMA,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "template.share.invite",
        maxRequests: 12,
        windowMs: 10 * 60 * 1000,
      });

      const template = await assertShareableTemplate(ctx, input.templateId);
      const recipientEmail = normalizeTemplateShareEmail(input.email);
      const expiresAt = getTemplateShareExpiry("INVITE", input.validForDays);
      const origin = getAppOriginFromHeaders(ctx.headers);
      const { token, shareId } = await createShareRecord({
        ctx,
        templateId: template.id,
        kind: "INVITE",
        recipientEmail,
        expiresAt,
      });
      const claimUrl = buildAppUrl(origin, templateSharePath(token));
      const templateName = template.name ?? template.bookTitle ?? "Vorlage";
      const html = createTemplateInviteEmail({
        claimUrl,
        templateName,
        expiresAt,
      });

      try {
        await sendTemplateInvitation(recipientEmail, html);
      } catch (error) {
        await ctx.db.templateShare.update({
          where: { id: shareId },
          data: { revokedAt: new Date() },
        });
        logger.warn("template_invitation_delivery_failed", { shareId, error });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Die Einladung konnte nicht versendet werden. Bitte versuchen Sie es erneut.",
        });
      }

      return {
        inviteSent: true,
        email: maskEmail(recipientEmail),
        expiresAt,
      };
    }),

  getShare: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const tokenHash = hashTemplateShareToken(input.token);
      const share = await ctx.db.templateShare.findUnique({
        where: { tokenHash },
        include: {
          template: { include: { modules: true } },
          claims: {
            where: { userId: ctx.session?.user.id ?? "" },
            select: {
              book: {
                select: { id: true, createdById: true, deletedAt: true },
              },
            },
            take: 1,
          },
        },
      });

      if (!share || share.revokedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dieser Template-Link ist ungueltig.",
        });
      }

      const claimedBook = share.claims[0]?.book;
      const existingBookId =
        claimedBook &&
        !claimedBook.deletedAt &&
        claimedBook.createdById === ctx.session?.user.id
          ? claimedBook.id
          : null;
      if (!existingBookId && share.expiresAt.getTime() <= Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Dieser Template-Link ist abgelaufen.",
        });
      }

      if (
        !existingBookId &&
        (!share.template.isTemplate || share.template.deletedAt)
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diese Vorlage ist nicht mehr verfuegbar.",
        });
      }

      return {
        kind: share.kind,
        expiresAt: share.expiresAt,
        existingBookId,
        recipientMatchesSession: !ctx.session?.user.email
          ? null
          : !share.recipientEmail ||
            normalizeTemplateShareEmail(share.recipientEmail) ===
              normalizeTemplateShareEmail(ctx.session.user.email),
        recipientEmail: share.recipientEmail
          ? maskEmail(share.recipientEmail)
          : null,
        template: {
          name: share.template.name ?? share.template.bookTitle ?? "Vorlage",
          moduleCount: share.template.modules.length,
        },
      };
    }),

  claim: protectedProcedure
    .input(
      z.object({
        token: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "template.share.claim",
        maxRequests: 10,
        windowMs: 10 * 60 * 1000,
      });

      const email = ctx.session.user.email?.trim();
      if (!email) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Bitte mit verifizierter E-Mail anmelden.",
        });
      }

      return claimTemplateShareForUser(ctx.db, {
        token: input.token,
        userId: ctx.session.user.id,
        userEmail: email,
      });
    }),
});
