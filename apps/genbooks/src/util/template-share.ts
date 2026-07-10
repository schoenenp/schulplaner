import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";

import { Naming } from "@/util/naming";

const TEMPLATE_SHARE_TOKEN_BYTES = 32;
const DEFAULT_LINK_VALID_DAYS = 30;
const DEFAULT_INVITE_VALID_DAYS = 14;
const SECONDS_IN_DAY = 24 * 60 * 60;

export function createTemplateShareToken(): string {
  return crypto.randomBytes(TEMPLATE_SHARE_TOKEN_BYTES).toString("hex");
}

export function hashTemplateShareToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function normalizeTemplateShareEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getTemplateShareExpiry(
  kind: "LINK" | "INVITE",
  validForDays?: number,
  fromDate = new Date(),
): Date {
  const days =
    validForDays ??
    (kind === "INVITE" ? DEFAULT_INVITE_VALID_DAYS : DEFAULT_LINK_VALID_DAYS);
  return new Date(fromDate.getTime() + days * SECONDS_IN_DAY * 1000);
}

export function escapeTemplateShareHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createTemplateInviteEmail(params: {
  claimUrl: string;
  templateName: string;
  expiresAt: Date;
}) {
  const safeTemplateName = escapeTemplateShareHtml(params.templateName);
  const safeClaimUrl = escapeTemplateShareHtml(params.claimUrl);
  const safeExpiry = escapeTemplateShareHtml(
    params.expiresAt.toLocaleString("de-DE"),
  );

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Planer-Vorlage beanspruchen</title>
    </head>
    <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f8fafc;line-height:1.6;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;">
        <div style="background:#2563eb;padding:32px 28px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:26px;font-weight:700;">Planer-Vorlage freigegeben</h1>
        </div>
        <div style="padding:32px 28px;color:#1f2937;">
          <p style="font-size:16px;margin:0 0 18px 0;">
            Fuer Sie wurde die Vorlage <strong>${safeTemplateName}</strong> freigegeben.
          </p>
          <p style="font-size:16px;margin:0 0 24px 0;">
            Mit dem Button bestaetigen Sie Ihre E-Mail-Adresse und die Vorlage wird als eigener Planer in Ihrem Dashboard angelegt.
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${safeClaimUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:700;font-size:16px;">
              Jetzt beanspruchen!
            </a>
          </div>
          <p style="font-size:13px;color:#64748b;margin:24px 0 0 0;">
            Dieser Link ist bis ${safeExpiry} gueltig. Falls der Button nicht funktioniert, kopieren Sie diese URL in Ihren Browser:<br />
            <span style="word-break:break-all;">${safeClaimUrl}</span>
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    String(error.code) === "P2002"
  );
}

async function getExistingClaimResult(
  db: PrismaClient,
  params: {
    tokenHash: string;
    userId: string;
  },
) {
  const share = await db.templateShare.findUnique({
    where: { tokenHash: params.tokenHash },
    select: {
      template: {
        select: {
          name: true,
        },
      },
      claims: {
        where: { userId: params.userId },
        select: {
          book: {
            select: {
              id: true,
              deletedAt: true,
            },
          },
        },
        take: 1,
      },
    },
  });

  const existingBook = share?.claims[0]?.book;
  if (!existingBook || existingBook.deletedAt) {
    return null;
  }

  return {
    bookId: existingBook.id,
    alreadyClaimed: true,
    templateName: share.template.name ?? "Vorlage",
  };
}

export async function claimTemplateShareForUser(
  db: PrismaClient,
  params: {
    token: string;
    userId: string;
    userEmail: string;
  },
) {
  const tokenHash = hashTemplateShareToken(params.token);
  const userEmail = normalizeTemplateShareEmail(params.userEmail);

  if (!userEmail) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Bitte mit verifizierter E-Mail anmelden.",
    });
  }

  try {
    return await db.$transaction(async (tx) => {
      const share = await tx.templateShare.findUnique({
        where: { tokenHash },
        include: {
          template: {
            include: {
              modules: true,
            },
          },
          claims: {
            where: { userId: params.userId },
            include: {
              book: {
                select: {
                  id: true,
                  deletedAt: true,
                },
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

      if (share.expiresAt.getTime() < Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Dieser Template-Link ist abgelaufen.",
        });
      }

      if (!share.template.isTemplate || share.template.deletedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Diese Vorlage ist nicht mehr verfuegbar.",
        });
      }

      const recipientEmail = share.recipientEmail
        ? normalizeTemplateShareEmail(share.recipientEmail)
        : null;
      if (recipientEmail && recipientEmail !== userEmail) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Diese Einladung ist fuer eine andere E-Mail-Adresse.",
        });
      }

      const existingClaim = share.claims[0];
      if (existingClaim?.book && !existingClaim.book.deletedAt) {
        return {
          bookId: existingClaim.book.id,
          alreadyClaimed: true,
          templateName: share.template.name ?? "Vorlage",
        };
      }

      if (share.kind === "INVITE") {
        const claimedInvite = await tx.templateShareClaim.findFirst({
          where: { shareId: share.id },
          select: { userId: true },
        });

        if (claimedInvite && claimedInvite.userId !== params.userId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Diese Einladung wurde bereits beansprucht.",
          });
        }
      }

      const book = await tx.book.create({
        data: {
          name: Naming.bookCopy(share.template.name),
          bookTitle: share.template.bookTitle,
          subTitle: share.template.subTitle,
          format: share.template.format,
          region: share.template.region,
          planStart: share.template.planStart,
          planEnd: share.template.planEnd,
          country: share.template.country,
          copyFromId: share.template.id,
          createdById: params.userId,
          sourceType: "TEMPLATE_SHARE",
          modules: {
            create: share.template.modules.map((moduleItem) => ({
              idx: moduleItem.idx,
              moduleId: moduleItem.moduleId,
              colorCode: moduleItem.colorCode,
            })),
          },
        },
      });

      if (existingClaim) {
        await tx.templateShareClaim.update({
          where: { id: existingClaim.id },
          data: {
            bookId: book.id,
            email: userEmail,
            claimedAt: new Date(),
          },
        });
      } else {
        await tx.templateShareClaim.create({
          data: {
            shareId: share.id,
            userId: params.userId,
            bookId: book.id,
            email: userEmail,
          },
        });
      }

      return {
        bookId: book.id,
        alreadyClaimed: false,
        templateName: share.template.name ?? "Vorlage",
      };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const existingClaimResult = await getExistingClaimResult(db, {
        tokenHash,
        userId: params.userId,
      });
      if (existingClaimResult) {
        return existingClaimResult;
      }
    }

    throw error;
  }
}
