import { BookPart, Visibility, type Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { handleBookPart } from "@/server/util/module/functions";
import {
  isModulePdfFile,
  isThumbnailFile,
  pickCoverImageFile,
  pickModulePdfFile,
  pickPrimaryModuleFile,
} from "@/util/module-files";

const DEFAULT_PREVIEW_SRC = "/default.png";

const moduleOrigin = z.enum(["CATALOG", "USER"]);

const moduleListInput = z.object({
  search: z.string().trim().optional(),
  type: z.string().trim().optional(),
  visibility: z.nativeEnum(Visibility).optional(),
  part: z.nativeEnum(BookPart).optional(),
  origin: moduleOrigin.optional(),
  page: z.number().positive().default(1),
  limit: z.number().positive().max(100).default(20),
});

const uploadedFileInput = z.object({
  name: z.string().nullable().optional(),
  src: z.string(),
  type: z.enum(["PDF", "IMAGE_PNG", "IMAGE_JPEG"]),
  size: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative().nullish(),
  srcGrayscale: z.string().nullish(),
});

const activeModuleWhere: Prisma.ModuleWhereInput = {
  deletedAt: null,
};

function buildModuleListWhere(filters: {
  search?: string;
  type?: string;
  visibility?: Visibility;
  part?: BookPart;
  origin?: z.infer<typeof moduleOrigin>;
}): Prisma.ModuleWhereInput {
  const { search, type, visibility, part, origin } = filters;

  const searchTerm = search?.trim();
  const typeTerm = type?.trim();

  return {
    ...activeModuleWhere,
    ...(visibility ? { visible: visibility } : {}),
    ...(part ? { part } : {}),
    ...(origin
      ? { createdById: origin === "CATALOG" ? null : { not: null } }
      : {}),
    ...(typeTerm
      ? {
          type: {
            name: {
              equals: typeTerm.toLowerCase(),
            },
          },
        }
      : {}),
    ...(searchTerm
      ? {
          OR: [
            { name: { contains: searchTerm } },
            { theme: { contains: searchTerm } },
            {
              type: {
                name: { contains: searchTerm.toLowerCase() },
              },
            },
          ],
        }
      : {}),
  };
}

function getModulePreviewSrc(
  files: { name: string | null; src: string; type: string }[],
): string {
  const previewFile =
    files.find((file) => isThumbnailFile(file)) ?? pickCoverImageFile(files);

  return previewFile?.src ?? DEFAULT_PREVIEW_SRC;
}

export const moduleRouter = createTRPCRouter({
  getPreview: publicProcedure
    .input(
      z.object({
        mid: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const foundModule = await ctx.db.module.findFirst({
        where: {
          id: input.mid,
        },
        include: {
          files: {
            select: {
              src: true,
              name: true,
              type: true,
            },
          },
        },
      });

      if (!foundModule) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No module found." });
      }

      return getModulePreviewSrc(foundModule.files) ?? DEFAULT_PREVIEW_SRC;
    }),

  initPage: protectedProcedure.query(async ({ ctx }) => {
    const [modules, tags, types] = await Promise.all([
      ctx.db.module.findMany({
        where: activeModuleWhere,
        include: {
          type: true,
          files: true,
        },
      }),
      ctx.db.tag.findMany({
        where: {
          deletedAt: null,
          status: {
            not: "UNRELEASED",
          },
        },
        select: {
          id: true,
          name: true,
          output: true,
        },
      }),
      ctx.db.moduleType.findMany({
        where: {
          deletedAt: null,
        },
      }),
    ]);

    return {
      modules,
      tags,
      types,
    };
  }),

  getAll: publicProcedure
    .input(moduleListInput)
    .query(async ({ ctx, input }) => {
      const { page, limit, search, type, visibility, part, origin } = input;
      const where = buildModuleListWhere({
        search,
        type,
        visibility,
        part,
        origin,
      });

      const [items, total] = await Promise.all([
        ctx.db.module.findMany({
          where,
          select: {
            id: true,
            name: true,
            theme: true,
            part: true,
            visible: true,
            updatedAt: true,
            createdBy: {
              select: {
                name: true,
                email: true,
              },
            },
            type: {
              select: {
                id: true,
                name: true,
                minPages: true,
                maxPages: true,
              },
            },
            files: {
              select: {
                name: true,
                src: true,
                type: true,
              },
            },
            _count: {
              select: {
                allowedTags: true,
              },
            },
          },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        }),
        ctx.db.module.count({ where }),
      ]);

      return {
        items: items.map((item) => {
          const previewSrc = getModulePreviewSrc(item.files);
          const hasThumbnail = item.files.some((file) => isThumbnailFile(file));
          const hasPdf = item.files.some((file) => isModulePdfFile(file));
          const hasSourceFile = Boolean(pickPrimaryModuleFile(item.files));

          return {
            id: item.id,
            name: item.name,
            theme: item.theme,
            part: item.part,
            visible: item.visible,
            updatedAt: item.updatedAt,
            createdBy: item.createdBy
              ? (item.createdBy.name ?? item.createdBy.email)
              : null,
            previewSrc,
            hasThumbnail,
            hasPdf,
            hasSourceFile,
            tagCount: item._count.allowedTags,
            type: item.type,
          };
        }),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      };
    }),

  getInsights: protectedProcedure.query(async ({ ctx }) => {
    const [
      modules,
      visibilityGroups,
      partGroups,
      typeEntries,
      totalTypes,
      totalTags,
      releasedTags,
      betaTags,
      tooltipTotal,
    ] = await Promise.all([
      ctx.db.module.findMany({
        where: activeModuleWhere,
        select: {
          id: true,
          name: true,
          theme: true,
          visible: true,
          part: true,
          updatedAt: true,
          type: {
            select: {
              name: true,
            },
          },
          files: {
            select: {
              name: true,
              src: true,
              type: true,
            },
          },
          _count: {
            select: {
              allowedTags: true,
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      }),
      ctx.db.module.groupBy({
        by: ["visible"],
        where: activeModuleWhere,
        _count: {
          _all: true,
        },
      }),
      ctx.db.module.groupBy({
        by: ["part"],
        where: activeModuleWhere,
        _count: {
          _all: true,
        },
      }),
      ctx.db.moduleType.findMany({
        where: {
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              modules: {
                where: activeModuleWhere,
              },
            },
          },
        },
      }),
      ctx.db.moduleType.count({
        where: {
          deletedAt: null,
        },
      }),
      ctx.db.tag.count({
        where: {
          deletedAt: null,
        },
      }),
      ctx.db.tag.count({
        where: {
          deletedAt: null,
          status: "RELEASED",
        },
      }),
      ctx.db.tag.count({
        where: {
          deletedAt: null,
          status: "BETA",
        },
      }),
      ctx.db.tooltip.count({
        where: {
          deletedAt: null,
        },
      }),
    ]);

    const totalModules = modules.length;
    const missingPreviewCount = modules.filter(
      (moduleItem) => !moduleItem.files.some((file) => isThumbnailFile(file)),
    ).length;
    const missingFileCount = modules.filter(
      (moduleItem) => !pickPrimaryModuleFile(moduleItem.files),
    ).length;
    const missingPdfCount = modules.filter(
      (moduleItem) => !moduleItem.files.some((file) => isModulePdfFile(file)),
    ).length;
    const untaggedCount = modules.filter(
      (moduleItem) => moduleItem._count.allowedTags === 0,
    ).length;
    const withoutThemeCount = modules.filter(
      (moduleItem) => !moduleItem.theme?.trim(),
    ).length;

    const visibilityBreakdown = ["PUBLIC", "SHARED", "PRIVATE"].map(
      (visibilityValue) => ({
        visibility: visibilityValue as Visibility,
        count:
          visibilityGroups.find((entry) => entry.visible === visibilityValue)
            ?._count._all ?? 0,
      }),
    );

    const partBreakdown = ["DEFAULT", "PLANNER", "COVER", "BINDING"].map(
      (partValue) => ({
        part: partValue as BookPart,
        count:
          partGroups.find((entry) => entry.part === partValue)?._count._all ??
          0,
      }),
    );

    const topTypes = typeEntries
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        count: entry._count.modules,
      }))
      .filter((entry) => entry.count > 0)
      .sort((left, right) => right.count - left.count)
      .slice(0, 5);

    const recentModules = modules.slice(0, 6).map((moduleItem) => ({
      id: moduleItem.id,
      name: moduleItem.name,
      theme: moduleItem.theme,
      visible: moduleItem.visible,
      part: moduleItem.part,
      updatedAt: moduleItem.updatedAt,
      typeName: moduleItem.type.name,
      previewSrc: getModulePreviewSrc(moduleItem.files),
      hasThumbnail: moduleItem.files.some((file) => isThumbnailFile(file)),
      hasPdf: moduleItem.files.some((file) => isModulePdfFile(file)),
      tagCount: moduleItem._count.allowedTags,
    }));

    return {
      summary: {
        totalModules,
        totalTypes,
        totalTags,
        releasedTags,
        betaTags,
        unreleasedTags: Math.max(0, totalTags - releasedTags - betaTags),
        tooltipTotal,
        missingFileCount,
        missingPreviewCount,
        missingPdfCount,
        untaggedCount,
        withoutThemeCount,
      },
      visibilityBreakdown,
      partBreakdown,
      topTypes,
      recentModules,
    };
  }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(40),
        type: z.string(),
        uploadedFile: uploadedFileInput.optional(),
        uploadedThumbnail: uploadedFileInput.optional(),
        theme: z.string().min(1).max(40).optional(),
        tagIds: z.number().array().optional(),
        visible: z.enum(["PUBLIC", "SHARED", "PRIVATE"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        id,
        name,
        type,
        theme,
        uploadedFile,
        uploadedThumbnail,
        tagIds,
        visible,
      } = input;

      const existingModule = await ctx.db.module.findUnique({
        where: { id },
        include: { type: true, files: true },
      });

      if (!existingModule) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Module not found" });
      }

      const typeName = type.toLocaleLowerCase();
      const existingType = await ctx.db.moduleType.findFirst({
        where: { name: typeName },
      });

      const typeConnect = existingType
        ? { connect: { id: existingType.id } }
        : {
            create: {
              name: typeName,
              minPages: 1,
            },
          };

      const filesToDisconnect: { id: string }[] = [];
      const uploadedFiles = [uploadedFile, uploadedThumbnail].filter(
        (file): file is NonNullable<typeof file> => file !== undefined,
      );

      if (uploadedFile) {
        const oldFile = pickModulePdfFile(existingModule.files);
        if (oldFile) filesToDisconnect.push({ id: oldFile.id });
      }

      if (uploadedThumbnail) {
        const oldThumb = existingModule.files.find((file) =>
          isThumbnailFile(file),
        );
        if (oldThumb) filesToDisconnect.push({ id: oldThumb.id });
      }

      const updatedModule = await ctx.db.module.update({
        where: { id },
        data: {
          name,
          theme,
          part: handleBookPart(type),
          type: typeConnect,
          visible,
          allowedTags: {
            set: tagIds?.map((tagId) => ({ id: tagId })) ?? [],
          },
          files: {
            create: uploadedFiles,
            disconnect: filesToDisconnect.length
              ? filesToDisconnect
              : undefined,
          },
        },
      });

      return updatedModule;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(40),
        type: z.string(),
        uploadedFile: uploadedFileInput.optional(),
        uploadedThumbnail: uploadedFileInput.optional(),
        theme: z.string().min(1).max(40).optional(),
        tagIds: z.number().array().optional(),
        visible: z.enum(["PUBLIC", "SHARED", "PRIVATE"]).default("PUBLIC"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const {
        name,
        type,
        theme,
        uploadedFile,
        uploadedThumbnail,
        tagIds,
        visible,
      } = input;

      const typeName = type.toLocaleLowerCase();
      const existingType = await ctx.db.moduleType.findFirst({
        where: { name: typeName },
      });

      const typeConnect = existingType
        ? { connect: { id: existingType.id } }
        : {
            create: {
              name: typeName,
              minPages: 1,
            },
          };

      const uploadedFiles = [uploadedFile, uploadedThumbnail].filter(
        (file): file is NonNullable<typeof file> => file !== undefined,
      );

      const bookPart = handleBookPart(type);

      return ctx.db.module.create({
        data: {
          name,
          theme,
          part: bookPart,
          visible,
          type: typeConnect,
          allowedTags: {
            connect: tagIds?.map((tagId) => ({ id: tagId })),
          },
          files: {
            create: uploadedFiles,
          },
        },
      });
    }),

  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id } = input;
      return ctx.db.module.update({
        where: {
          id,
        },
        data: {
          deletedAt: new Date(),
        },
      });
    }),
});
