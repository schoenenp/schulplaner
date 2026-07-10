import { z } from "zod";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import {
  isThumbnailFile,
  pickCoverImageFile,
  pickModulePdfFile,
} from "@/util/module-files";
import { handleBookPart } from "@/util/book/functions";
import {
  buildModuleFeedVisibilityWhere,
  buildModulePreviewVisibilityWhere,
} from "./module-visibility";

const COVER_TYPE = "umschlag";

// Metadata of a file already stored via /api/module-files. Raw bytes never
// travel through tRPC; the route handler validated and uploaded them.
const uploadedFileInput = z.object({
  name: z.string().nullable().optional(),
  src: z.string(),
  type: z.enum(["PDF", "IMAGE_PNG", "IMAGE_JPEG"]),
  size: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative().nullish(),
  srcGrayscale: z.string().nullish(),
});

type UploadedFileInput = z.infer<typeof uploadedFileInput>;

function normalizeType(type: string): string {
  return type.toLocaleLowerCase();
}

function isCoverType(type: string): boolean {
  return normalizeType(type) === COVER_TYPE;
}

function toModuleAssetSrc(src: string): string {
  return /^https?:\/\//i.test(src) ? src : `https://cdn.pirrot.de${src}`;
}

function getModuleThumbnailSrc(
  files: Array<{ name: string | null; src: string }>,
): string {
  const thumbnailFile = files.find((file) => file.name?.startsWith("thumb_"));
  const coverImageFile = pickCoverImageFile(files);
  const previewFile = thumbnailFile ?? coverImageFile;

  return previewFile ? toModuleAssetSrc(previewFile.src) : "/default.png";
}

export const moduleRouter = createTRPCRouter({
  initPage: protectedProcedure.query(({ ctx }) => {
    // Everyone only handles their own modules here; the full catalog is
    // managed in the staff panel.
    const modules =
      ctx.db.module.findMany({
        where: {
          deletedAt: null,
          createdById: ctx.session.user.id,
        },
        include: {
          type: true,
          files: true,
        },
      }) ?? [];

    const tags =
      ctx.db.tag.findMany({
        where: {
          status: {
            not: "UNRELEASED",
          },
        },
        select: {
          id: true,
          name: true,
          output: true,
        },
      }) ?? [];

    const types =
      ctx.db.moduleType.findMany({
        where: {
          name: {
            in: ["wochenplaner", "umschlag", "sonstige"],
          },
        },
      }) ?? [];

    return {
      modules,
      tags,
      types,
    };
  }),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        type: z.string(),
        uploadedFile: uploadedFileInput,
        uploadedThumbnail: uploadedFileInput.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db, session } = ctx;
      const { name, type, uploadedFile, uploadedThumbnail } = input;
      const currentUser = await db.user.findUnique({
        where: {
          id: session.user.id,
        },
      });

      if (!currentUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const filesToCreate: UploadedFileInput[] = [uploadedFile];
      if (uploadedThumbnail) {
        filesToCreate.push(uploadedThumbnail);
      }

      const customModuleType =
        (await db.moduleType.findFirst({
          where: {
            name: type,
          },
        })) ??
        (await db.moduleType.findFirst({
          where: {
            name: "sonstige",
          },
        }));

      if (!customModuleType) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Custom file type not allowed",
        });
      }

      return db.module.create({
        data: {
          name,
          part: handleBookPart(type),
          type: {
            connect: {
              id: customModuleType.id,
            },
          },
          theme: "custom",
          files: {
            create: filesToCreate,
          },
          createdBy: {
            connect: {
              id: session.user.id,
            },
          },
          visible: "PRIVATE",
        },
      });
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(40),
        type: z.string(),
        uploadedFile: uploadedFileInput.optional(),
        uploadedThumbnail: uploadedFileInput.optional(),
        tagIds: z.number().array().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, name, type, uploadedFile, uploadedThumbnail, tagIds } =
        input;
      const existingModule = await ctx.db.module.findFirst({
        where: {
          id,
        },
        include: {
          type: true,
          files: true,
        },
      });

      if (!existingModule) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Module not found" });
      }

      if (existingModule.createdById !== ctx.session.user.id) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const existingType = await ctx.db.moduleType.findFirst({
        where: {
          name: type.toLocaleLowerCase(),
        },
      });

      function handleTypeConnection(insertType: string, moduleType: string) {
        if (insertType === moduleType) {
          return undefined;
        }
        if (existingType) {
          return {
            connect: { id: existingType.id },
          };
        }
        return {
          create: {
            name: insertType.toLocaleLowerCase(),
            minPages: 1,
          },
        };
      }

      const filesToDisconnect: Array<{ id: string }> = [];
      const filesToCreate: UploadedFileInput[] = [];
      const existingPdfFile = pickModulePdfFile(existingModule.files);
      const existingCoverImageFile = pickCoverImageFile(existingModule.files);
      const existingThumbnailFiles =
        existingModule.files.filter(isThumbnailFile);

      if (!isCoverType(type) && existingCoverImageFile && !uploadedFile) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Image-based cover modules need a replacement PDF before changing the module type",
        });
      }

      if (uploadedFile) {
        if (existingPdfFile) {
          filesToDisconnect.push({ id: existingPdfFile.id });
        }
        if (existingCoverImageFile) {
          filesToDisconnect.push({ id: existingCoverImageFile.id });
        }
        filesToDisconnect.push(
          ...existingThumbnailFiles.map((file) => ({ id: file.id })),
        );
        filesToCreate.push(uploadedFile);
        if (uploadedThumbnail) {
          filesToCreate.push(uploadedThumbnail);
        }
      } else if (!isCoverType(type) && existingCoverImageFile) {
        filesToDisconnect.push({ id: existingCoverImageFile.id });
      }

      const bookPart = handleBookPart(type);

      const updatedModule = await ctx.db.module.update({
        where: {
          id,
        },
        data: {
          name,
          theme: "custom",
          part: bookPart,
          type: handleTypeConnection(type, existingModule.type.name),
          allowedTags: {
            connect: tagIds?.map((id) => ({ id })),
          },
          files: {
            create: filesToCreate.length >= 1 ? filesToCreate : undefined,
            disconnect:
              filesToDisconnect.length >= 1 ? filesToDisconnect : undefined,
          },
        },
      });

      return updatedModule;
    }),
  getUserModules: protectedProcedure.query(async ({ ctx }) => {
    const { db, session } = ctx;

    // Everyone only handles their own modules here; the full catalog is
    // managed in the staff panel.
    const foundModules = await db.module.findMany({
      where: {
        deletedAt: null,
        createdById: session.user.id,
      },
      include: {
        type: true,
        files: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return foundModules.map((moduleItem) => {
      return {
        id: moduleItem.id,
        name: moduleItem.name,
        type: moduleItem.type.name,
        theme: moduleItem.theme,
        part: moduleItem.part,
        thumbnail: getModuleThumbnailSrc(moduleItem.files),
        visible: moduleItem.visible,
      };
    });
  }),
  getPreview: publicProcedure
    .input(
      z.object({
        mid: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sessionUserId = ctx.session?.user.id;
      const foundModule = await ctx.db.module.findFirst({
        where: {
          id: input.mid,
          deletedAt: null,
          ...buildModulePreviewVisibilityWhere(sessionUserId),
        },
        include: {
          files: {
            select: {
              src: true,
              name: true,
            },
          },
        },
      });

      if (!foundModule) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Module not found" });
      }

      const previewFile =
        foundModule.files.find((f) => f.name?.startsWith("thumb_")) ??
        pickCoverImageFile(foundModule.files);
      return previewFile?.src ?? "/default.png";
    }),
  getByTypes: publicProcedure
    .input(
      z.object({
        included: z.string().array(),
        excluded: z.string().array(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { included, excluded } = input;
      const { db } = ctx;
      const userId = ctx.session?.user.id;

      const foundModules = await db.module.findMany({
        where: {
          deletedAt: null,
          ...buildModuleFeedVisibilityWhere(userId),
          type: {
            name: {
              in: included.length > 0 ? included : undefined,
              notIn: excluded.length > 0 ? excluded : undefined,
            },
          },
        },
        include: {
          files: true,
          type: true,
        },
      });

      const moduleResponse = foundModules.map((module) => {
        const { id, name, theme, files, type } = module;

        return {
          id,
          name,
          theme,
          type: type.name,
          thumbnail: getModuleThumbnailSrc(files),
        };
      });

      return moduleResponse;
    }),
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id } = input;
      const existingModule = await ctx.db.module.findFirst({
        where: { id, deletedAt: null },
        select: {
          id: true,
          createdById: true,
        },
      });

      if (!existingModule) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Module not found" });
      }

      if (existingModule.createdById !== ctx.session.user.id) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

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
