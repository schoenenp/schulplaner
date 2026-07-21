import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "db";

import { env } from "@/env";
import { protectedProcedure, createTRPCRouter } from "@/server/api/trpc";
import { enforceProcedureRateLimit } from "@/server/util/rate-limit";
import { pickCoverImageFile, pickModulePdfFile } from "@/util/module-files";
import { formatDateKeyUTC } from "@/util/format";

const COVER_MODULE_TYPE = "umschlag";
const COVER_MODULE_IDX = 12345;

function toAbsoluteCdnUrl(src: string): string {
  return /^https?:\/\//i.test(src) ? src : env.NEXT_PUBLIC_CDN_SERVER_URL + src;
}

const listInput = z.object({
  query: z.string().trim().max(120).optional(),
  kind: z.enum(["ALL", "TEMPLATE", "PLANNER"]).default("ALL"),
  featured: z.boolean().optional(),
  includeDeleted: z.boolean().default(false),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(20),
});

function buildBookWhere(
  input: z.infer<typeof listInput>,
): Prisma.BookWhereInput {
  const query = input.query && input.query.length > 0 ? input.query : undefined;

  return {
    ...(input.includeDeleted ? {} : { deletedAt: null }),
    ...(input.kind === "TEMPLATE" ? { isTemplate: true } : {}),
    ...(input.kind === "PLANNER" ? { isTemplate: false } : {}),
    ...(input.featured !== undefined ? { isFeatured: input.featured } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query } },
            { bookTitle: { contains: query } },
            { createdBy: { email: { contains: query } } },
            { id: query },
          ],
        }
      : {}),
  };
}

export const plannerRouter = createTRPCRouter({
  getOverview: protectedProcedure.query(async ({ ctx }) => {
    const [
      totalTemplates,
      featuredTemplates,
      totalPlanners,
      totalModules,
      visibilityBuckets,
      typeGroups,
      moduleTypes,
    ] = await Promise.all([
      ctx.db.book.count({ where: { deletedAt: null, isTemplate: true } }),
      ctx.db.book.count({
        where: { deletedAt: null, isTemplate: true, isFeatured: true },
      }),
      ctx.db.book.count({ where: { deletedAt: null, isTemplate: false } }),
      ctx.db.module.count({ where: { deletedAt: null } }),
      ctx.db.module.groupBy({
        by: ["visible"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      ctx.db.module.groupBy({
        by: ["typeId"],
        where: { deletedAt: null },
        _count: { _all: true },
      }),
      ctx.db.moduleType.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
        },
      }),
    ]);

    const typeNameMap = new Map(
      moduleTypes.map((entry) => [entry.id, entry.name]),
    );
    const modulesByType = typeGroups
      .map((entry) => ({
        typeId: entry.typeId,
        typeName: typeNameMap.get(entry.typeId) ?? entry.typeId,
        count: entry._count._all,
      }))
      .sort((a, b) => b.count - a.count);

    const visibility = visibilityBuckets.reduce(
      (acc, entry) => {
        acc[entry.visible] = entry._count._all;
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      totalTemplates,
      featuredTemplates,
      totalPlanners,
      totalModules,
      visibility,
      modulesByType,
    };
  }),

  getAll: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const where = buildBookWhere(input);

    const [total, items] = await Promise.all([
      ctx.db.book.count({ where }),
      ctx.db.book.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          name: true,
          bookTitle: true,
          format: true,
          region: true,
          planStart: true,
          planEnd: true,
          isTemplate: true,
          isFeatured: true,
          isPublic: true,
          sourceType: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
          createdBy: { select: { id: true, name: true, email: true } },
          _count: {
            select: { modules: true, ordered: true, copiedBooks: true },
          },
        },
      }),
    ]);

    return {
      items,
      total,
      page: input.page,
      pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
    };
  }),

  /**
   * Assembles everything the client-side PDF generator (the same pipeline as
   * the genbooks configurator) needs to render a planner: ordered module PDFs
   * with CDN urls, the cover, color map entries and the book details.
   */
  getPdfSource: protectedProcedure
    .input(z.object({ bookId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const book = await ctx.db.book.findUnique({
        where: { id: input.bookId },
        select: {
          id: true,
          name: true,
          bookTitle: true,
          format: true,
          region: true,
          country: true,
          planStart: true,
          planEnd: true,
          deletedAt: true,
          customDates: { select: { date: true, name: true } },
          modules: {
            select: {
              idx: true,
              colorCode: true,
              module: {
                select: {
                  id: true,
                  name: true,
                  part: true,
                  type: { select: { name: true } },
                  files: {
                    select: {
                      name: true,
                      type: true,
                      src: true,
                      pageCount: true,
                      srcGrayscale: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!book || book.deletedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Planer nicht gefunden.",
        });
      }

      const coverModule = book.modules.find(
        (entry) => entry.module.part === "COVER",
      );
      if (!coverModule) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Planer hat kein Umschlag-Modul.",
        });
      }
      const coverPdfFile = pickModulePdfFile(coverModule.module.files);
      if (!coverPdfFile) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Umschlag-Modul hat keine PDF-Datei.",
        });
      }

      const contentModules = book.modules
        .filter(
          (entry) =>
            entry.module.part === "DEFAULT" || entry.module.part === "PLANNER",
        )
        .sort((a, b) => a.idx - b.idx);
      if (contentModules.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Planer hat keine Inhaltsmodule.",
        });
      }

      const colorEntries: Array<[string, 1 | 4]> = [];
      const modules = contentModules.map((entry, idx) => {
        const pdfFile = pickModulePdfFile(entry.module.files);
        colorEntries.push([
          entry.module.id,
          entry.colorCode === "COLOR" ? 4 : 1,
        ]);
        return {
          id: entry.module.id,
          name: entry.module.name,
          idx,
          type: entry.module.type.name.toLowerCase(),
          pdfUrl: pdfFile ? toAbsoluteCdnUrl(pdfFile.src) : "",
          pageCount: pdfFile?.pageCount ?? null,
          grayscalePdfUrl: pdfFile?.srcGrayscale
            ? toAbsoluteCdnUrl(pdfFile.srcGrayscale)
            : null,
        };
      });

      const coverImageFile = pickCoverImageFile(coverModule.module.files);
      modules.push({
        id: coverModule.module.id,
        name: coverModule.module.name,
        idx: COVER_MODULE_IDX,
        type: COVER_MODULE_TYPE,
        pdfUrl: toAbsoluteCdnUrl(coverPdfFile.src),
        pageCount: coverPdfFile.pageCount ?? null,
        // Covers are re-filled per book and converted at generation time.
        grayscalePdfUrl: null,
        ...(coverImageFile
          ? { coverImageUrl: toAbsoluteCdnUrl(coverImageFile.src) }
          : {}),
      });

      return {
        fileName: book.name ?? book.bookTitle ?? book.id,
        format: book.format.includes("A4")
          ? ("DIN A4" as const)
          : ("DIN A5" as const),
        colorEntries,
        modules,
        bookDetails: {
          title: book.bookTitle ?? "Schulplaner",
          code: book.region ?? "DE-SL",
          country: book.country,
          addHolidays: true,
          period: {
            start: book.planStart,
            end: book.planEnd ?? undefined,
          },
          customDates: book.customDates.map((dateItem) => ({
            date: formatDateKeyUTC(dateItem.date),
            name: dateItem.name,
          })),
        },
      };
    }),

  setFlags: protectedProcedure
    .input(
      z
        .object({
          bookId: z.string().min(1),
          isTemplate: z.boolean().optional(),
          isFeatured: z.boolean().optional(),
          isPublic: z.boolean().optional(),
        })
        .refine(
          (value) =>
            value.isTemplate !== undefined ||
            value.isFeatured !== undefined ||
            value.isPublic !== undefined,
          { message: "Mindestens ein Flag angeben." },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "planner.setFlags",
        maxRequests: 60,
        windowMs: 10 * 60 * 1000,
      });

      const book = await ctx.db.book.findUnique({
        where: { id: input.bookId },
        select: { id: true, deletedAt: true },
      });
      if (!book || book.deletedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Planer nicht gefunden.",
        });
      }

      return ctx.db.book.update({
        where: { id: book.id },
        data: {
          ...(input.isTemplate !== undefined
            ? { isTemplate: input.isTemplate }
            : {}),
          ...(input.isFeatured !== undefined
            ? { isFeatured: input.isFeatured }
            : {}),
          ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
        },
        select: {
          id: true,
          isTemplate: true,
          isFeatured: true,
          isPublic: true,
        },
      });
    }),

  softDelete: protectedProcedure
    .input(z.object({ bookId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "planner.softDelete",
        maxRequests: 30,
        windowMs: 10 * 60 * 1000,
      });

      const book = await ctx.db.book.findUnique({
        where: { id: input.bookId },
        select: {
          id: true,
          deletedAt: true,
          _count: { select: { ordered: true } },
          partnerOrder: { select: { id: true, status: true } },
        },
      });
      if (!book || book.deletedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Planer nicht gefunden.",
        });
      }

      const hasOpenPartnerOrder =
        book.partnerOrder &&
        book.partnerOrder.status !== "PARTNER_DECLINED" &&
        book.partnerOrder.status !== "FULFILLED";
      if (book._count.ordered > 0 || hasOpenPartnerOrder) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Planer mit Bestellungen koennen nicht geloescht werden.",
        });
      }

      return ctx.db.book.update({
        where: { id: book.id },
        data: { deletedAt: new Date() },
        select: { id: true, deletedAt: true },
      });
    }),

  restore: protectedProcedure
    .input(z.object({ bookId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "planner.restore",
        maxRequests: 30,
        windowMs: 10 * 60 * 1000,
      });

      const book = await ctx.db.book.findUnique({
        where: { id: input.bookId },
        select: { id: true, deletedAt: true },
      });
      if (!book?.deletedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Kein geloeschter Planer mit dieser ID.",
        });
      }

      return ctx.db.book.update({
        where: { id: book.id },
        data: { deletedAt: null },
        select: { id: true, deletedAt: true },
      });
    }),
});
