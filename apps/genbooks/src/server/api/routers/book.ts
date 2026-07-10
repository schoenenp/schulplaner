import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { Naming } from "@/util/naming";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { canToggleTemplateByRole } from "./book-template-access";

async function getBookAccessMeta(
  ctx: {
    db: {
      book: {
        findUnique: (args: {
          where: { id: string };
          select: {
            id: true;
            createdById: true;
            isTemplate: true;
            deletedAt: true;
          };
        }) => Promise<{
          id: string;
          createdById: string | null;
          isTemplate: boolean;
          deletedAt: Date | null;
        } | null>;
      };
    };
  },
  bookId: string,
) {
  const book = await ctx.db.book.findUnique({
    where: { id: bookId },
    select: {
      id: true,
      createdById: true,
      isTemplate: true,
      deletedAt: true,
    },
  });

  if (!book || book.deletedAt) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
  }

  return book;
}

async function assertOwnedBookAccess(
  ctx: {
    db: {
      book: {
        findUnique: (args: {
          where: { id: string };
          select: {
            id: true;
            createdById: true;
            isTemplate: true;
            deletedAt: true;
          };
        }) => Promise<{
          id: string;
          createdById: string | null;
          isTemplate: boolean;
          deletedAt: Date | null;
        } | null>;
      };
    };
    session: { user: { id: string } };
  },
  bookId: string,
) {
  const book = await getBookAccessMeta(ctx, bookId);
  if (!book.createdById || book.createdById !== ctx.session.user.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return book;
}

export const bookRouter = createTRPCRouter({
  updateInfo: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string().nullable(),
        sub: z.string().optional().nullable(),
        country: z.string(),
        region: z.string().nullable(),
        period: z.object({
          start: z.string(),
          end: z.string().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Missing book id",
        });
      }
      await assertOwnedBookAccess(ctx, input.id);
      const { name, sub, period, region, country } = input;

      const { start: planStart, end: planEnd } = period;

      const start = new Date(planStart);
      const end = planEnd ? new Date(planEnd) : new Date();

      return ctx.db.book.update({
        where: {
          id: input.id,
        },
        data: {
          bookTitle: name,
          subTitle: sub,
          planStart: start,
          planEnd: end,
          region,
          country,
        },
      });
    }),
  updatePlannerName: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, name } = input;
      await assertOwnedBookAccess(ctx, id);
      return ctx.db.book.update({
        where: {
          id,
        },
        data: {
          name,
        },
      });
    }),
  saveBookModules: publicProcedure
    .input(
      z.object({
        bookId: z.string(),
        modules: z
          .object({
            id: z.string(),
            idx: z.number(),
            colorCode: z
              .number()
              .refine((val) => val === 1 || val === 4, {
                message: "Color code must be either 1 (grayscale) or 4 (color)",
              })
              .optional(),
          })
          .array(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { bookId, modules: bookModules } = input;
      const book = await getBookAccessMeta(ctx, bookId);
      const sessionUserId = ctx.session?.user.id;

      if (book.createdById) {
        if (book.createdById !== sessionUserId) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }
      } else if (book.isTemplate) {
        // Public template books are read-only in the configurator.
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      return ctx.db.$transaction(async (tx) => {
        return tx.book.update({
          where: {
            id: bookId,
          },
          data: {
            createdBy: ctx.session?.user.id
              ? {
                  connect: {
                    id: ctx.session.user.id,
                  },
                }
              : undefined,
            modules: {
              deleteMany: {},
              createMany: {
                data: bookModules.map((m) => ({
                  idx: m.idx,
                  moduleId: m.id,
                  colorCode: m.colorCode
                    ? m.colorCode === 4
                      ? "COLOR"
                      : "GRAYSCALE"
                    : undefined,
                })),
              },
            },
          },
        });
      });
    }),
  getUserBooks: protectedProcedure.query(({ ctx }) => {
    const { db, session } = ctx;
    return db.book.findMany({
      where: {
        createdById: session.user.id,
        deletedAt: null,
      },
      include: {
        modules: true,
      },
    });
  }),
  toggleTemplate: protectedProcedure
    .input(
      z.object({
        bookId: z.string(),
        isTemplate: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { bookId, isTemplate } = input;
      const user = ctx.session.user;
      const targetBook = await ctx.db.book.findFirst({
        where: { id: bookId, deletedAt: null },
        select: { id: true, createdById: true },
      });

      if (!targetBook) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
      }

      // Check role
      if (!canToggleTemplateByRole(user.role)) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      return ctx.db.book.update({
        where: { id: bookId },
        data: { isTemplate },
      });
    }),
  togglePublic: protectedProcedure
    .input(
      z.object({
        bookId: z.string(),
        isPublic: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { bookId, isPublic } = input;
      const user = ctx.session.user;
      const targetBook = await ctx.db.book.findFirst({
        where: { id: bookId, deletedAt: null },
        select: { id: true, createdById: true, isTemplate: true },
      });

      if (!targetBook) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Book not found" });
      }

      if (!targetBook.isTemplate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only templates can be made public",
        });
      }

      if (!canToggleTemplateByRole(user.role)) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      return ctx.db.book.update({
        where: { id: bookId },
        data: { isPublic },
      });
    }),
  getById: publicProcedure
    .input(
      z.object({
        id: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { id } = input;

      const { db } = ctx;
      if (!id) return null;

      const book = await db.book.findUnique({
        where: { id, deletedAt: null },
        include: {
          modules: true,
          customDates: true,
        },
      });

      if (!book) return null;

      const sessionUserId = ctx.session?.user.id;
      if (book.createdById && book.createdById !== sessionUserId) {
        return null;
      }

      if (!book.createdById && book.isTemplate) {
        return null;
      }

      if (book.sourceType !== "PARTNER_TEMPLATE") {
        return book;
      }

      if (book.isPublic) {
        return book;
      }

      const [campaign, partnerOrder] = await Promise.all([
        book.partnerPromotionCodeId
          ? db.campaign.findUnique({
              where: { promotionCodeId: book.partnerPromotionCodeId },
              select: { expiresAt: true },
            })
          : Promise.resolve(null),
        db.partnerOrder.findUnique({
          where: { bookId: book.id },
          select: { submittedAt: true, status: true },
        }),
      ]);

      return {
        ...book,
        partnerCampaignExpiresAt: campaign?.expiresAt ?? null,
        partnerOrderSubmittedAt: partnerOrder?.submittedAt ?? null,
        partnerOrderStatus: partnerOrder?.status ?? null,
      };
    }),
  saveCustomDates: protectedProcedure
    .input(
      z.object({
        bookId: z.string(),
        dates: z.array(
          z.object({
            date: z.string(), // ISO string
            name: z.string(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { bookId, dates } = input;
      await assertOwnedBookAccess(ctx, bookId);

      // Transaction: Delete old dates, create new ones
      return ctx.db.$transaction(async (tx) => {
        // 1. Delete existing dates
        await tx.customDate.deleteMany({
          where: { bookId },
        });

        // 2. Create new dates if any
        if (dates.length > 0) {
          await tx.customDate.createMany({
            data: dates.map((d) => ({
              bookId,
              date: d.date.includes("T")
                ? new Date(d.date)
                : new Date(`${d.date}T00:00:00.000Z`),
              name: d.name,
            })),
          });
        }
      });
    }),
  init: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        sub: z.string().min(1).optional(),
        country: z.string(),
        region: z.string(),
        planStart: z.string(),
        planEnd: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { name, sub, planStart, planEnd, region, country } = input;
      const start = new Date(planStart);
      const end = new Date(planEnd);

      return ctx.db.book.create({
        data: {
          name: Naming.book(),
          bookTitle: name,
          subTitle: sub,
          planStart: start,
          planEnd: end,
          region,
          country,
          createdById: ctx.session?.user ? ctx.session.user.id : undefined,
        },
      });
    }),
  delete: protectedProcedure
    .input(
      z.object({
        bookId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnedBookAccess(ctx, input.bookId);
      return ctx.db.book.update({
        where: {
          id: input.bookId,
        },
        data: {
          deletedAt: new Date(),
        },
      });
    }),
  getTemplates: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.book.findMany({
      where: {
        isTemplate: true,
        isPublic: true,
        deletedAt: null,
      },
      include: {
        modules: {
          include: {
            module: {
              include: {
                files: true,
              },
            },
          },
        },
      },
    });
  }),

  cloneTemplate: publicProcedure
    .input(z.object({ templateId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const template = await ctx.db.book.findFirst({
        where: { id: input.templateId, isTemplate: true, isPublic: true, deletedAt: null },
        include: {
          modules: true,
        },
      });

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      return ctx.db.book.create({
        data: {
          name: Naming.bookCopy(template.name),
          bookTitle: template.bookTitle,
          subTitle: template.subTitle,
          format: template.format,
          region: template.region,
          planStart: template.planStart,
          planEnd: template.planEnd,
          copyFromId: template.id,
          // Link new modules
          modules: {
            create: template.modules.map((m) => ({
              idx: m.idx,
              moduleId: m.moduleId,
              colorCode: m.colorCode,
            })),
          },
          // Assign to current user if logged in
          createdById: ctx.session?.user ? ctx.session.user.id : undefined,
        },
      });
    }),
});
