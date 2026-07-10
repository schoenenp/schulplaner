import { PDFDocument } from "pdf-lib";
import { logger } from "../logger";
import { BaseHandler } from "./base.handler";
import type { TagDefinition, TagContext, HandlerResult } from "../types";
import { convertPdfToGrayscale } from "../grayscale";
import { convertPdfToPreviewGrayscale } from "../preview-grayscale";

const COVER_IMAGE_FIELD_NAMES = [
  "COVER_IMAGE",
  "CUSTOM_IMAGE",
  "IMAGE",
] as const;

/**
 * Handler for "umschlag" (cover) modules.
 *
 * Covers are special modules that:
 * - Must have exactly 4 pages
 * - Pages 0-1 are front cover (added immediately)
 * - Pages 2-3 are back cover (stored for later, added at document end)
 *
 * Available tags:
 * - BOOK_TITLE: The title of the book
 * - FROM_TO: The date range (e.g., "2024" or "2024/2025")
 *
 * To add more tags, simply add them to the tags array below.
 */
class CoverHandler extends BaseHandler {
  readonly moduleType = "umschlag";

  readonly tags: TagDefinition[] = [
    {
      fieldName: "BOOK_TITLE",
      getValue: (ctx) => ctx.bookDetails.title,
      required: true,
    },
    {
      fieldName: "FROM_TO",
      getValue: (ctx) => {
        const start = ctx.bookDetails.period.start?.getFullYear();
        const end = ctx.bookDetails.period.end?.getFullYear();
        if (!start) return "";
        return start === end ? `${start}` : `${start}/${end}`;
      },
      required: true,
    },
    // Add more cover tags here as needed:
    // {
    //   fieldName: "SCHOOL_NAME",
    //   getValue: (ctx) => ctx.bookDetails.schoolName ?? "",
    // },
    // {
    //   fieldName: "CLASS_NAME",
    //   getValue: (ctx) => ctx.bookDetails.className ?? "",
    // },
  ];

  async process(
    context: TagContext,
    templateBytes: Uint8Array,
  ): Promise<HandlerResult> {
    const coverDoc = await PDFDocument.load(templateBytes);

    if (coverDoc.getPageCount() !== 4) {
      throw new Error("Cover module must have exactly 4 pages");
    }

    // Fill form fields
    const form = coverDoc.getForm();
    this.fillTags(form, context);
    await this.injectCustomCoverImage(coverDoc, context);
    form.flatten();

    let processedDoc = coverDoc;
    if (context.isGrayscale) {
      const coverBytes = await coverDoc.save();
      const grayscaleBytes = context.previewMode
        ? await convertPdfToPreviewGrayscale(coverBytes)
        : await convertPdfToGrayscale(coverBytes, {
            apiKey: context.grayscaleApiKey,
          });
      processedDoc = await PDFDocument.load(grayscaleBytes);
    }

    // Add front cover pages (0, 1)
    const frontPages = await context.finalPdf.copyPages(processedDoc, [0, 1]);
    frontPages.forEach((page) => context.finalPdf.addPage(page));

    // Create back cover document (pages 2, 3) to return for later use
    const backCoverDoc = await PDFDocument.create();
    const backPages = await backCoverDoc.copyPages(processedDoc, [2, 3]);
    backPages.forEach((page) => backCoverDoc.addPage(page));

    // Return front cover pages added (2) and back cover doc for finalization
    return {
      pagesAdded: 2,
      backCoverDoc,
    };
  }

  async calculatePageCount(): Promise<number> {
    // Cover always contributes 4 pages (2 front + 2 back)
    return 4;
  }

  private async injectCustomCoverImage(
    coverDoc: PDFDocument,
    context: TagContext,
  ): Promise<void> {
    const imageUrl = context.moduleItem.coverImageUrl;
    if (!imageUrl) {
      return;
    }

    const buttonField = this.findCoverImageButton(coverDoc);
    if (!buttonField) {
      throw new Error(
        `Custom cover image placeholder not found. Expected one of: ${COVER_IMAGE_FIELD_NAMES.join(", ")}`,
      );
    }

    const imageBytes = await this.fetchImageBytes(imageUrl);
    const embeddedImage = await this.embedCoverImage(coverDoc, imageBytes);
    buttonField.setImage(embeddedImage);
  }

  private findCoverImageButton(coverDoc: PDFDocument) {
    const form = coverDoc.getForm();

    for (const fieldName of COVER_IMAGE_FIELD_NAMES) {
      try {
        return form.getButton(fieldName);
      } catch {
        continue;
      }
    }

    return null;
  }

  private async fetchImageBytes(imageUrl: string): Promise<Uint8Array> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      logger.warn("custom_cover_image_fetch_failed", {
        imageUrl,
        status: response.status,
      });
      throw new Error("Failed to fetch custom cover image");
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  private async embedCoverImage(
    coverDoc: PDFDocument,
    imageBytes: Uint8Array,
  ) {
    const signature = Array.from(imageBytes.subarray(0, 8))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    if (signature.startsWith("89504e47")) {
      return coverDoc.embedPng(imageBytes);
    }

    if (signature.startsWith("ffd8ff")) {
      return coverDoc.embedJpg(imageBytes);
    }

    throw new Error(
      "Unsupported custom cover image format. Use PNG or JPEG for cover uploads.",
    );
  }
}

const coverHandler = new CoverHandler();
export default coverHandler;
