import { PDFDocument } from "pdf-lib";
import { BaseHandler } from "./base.handler";
import type { TagDefinition, TagContext, HandlerResult } from "../types";
import { convertPdfToGrayscale } from "../grayscale";
import { convertPdfToPreviewGrayscale } from "../preview-grayscale";
import { fetchPdfBytesOrNull } from "../helpers";

/**
 * Default handler for modules without specific form field requirements.
 *
 * This handler is used for:
 * - Static content modules (notes, rules, etc.)
 * - Any module type that doesn't have a specific handler
 *
 * The default handler simply copies pages from the template
 * without any form field processing.
 *
 * In preview mode, it limits to 5 pages per module.
 */
class DefaultHandler extends BaseHandler {
  readonly moduleType = "default";

  // No tags - default handler doesn't process form fields
  readonly tags: TagDefinition[] = [];

  /** Page budget per module in preview mode. */
  private static readonly PREVIEW_PAGE_LIMIT = 5;

  async process(
    context: TagContext,
    templateBytes: Uint8Array,
  ): Promise<HandlerResult> {
    return this.processWithLazyTemplate(context, async () => templateBytes);
  }

  async processWithLazyTemplate(
    context: TagContext,
    getTemplateBytes: () => Promise<Uint8Array>,
  ): Promise<HandlerResult> {
    const { finalPdf, previewMode, isGrayscale } = context;

    // Static modules do not need the original's form geometry. Only download
    // the original when a usable stored variant is unavailable.
    let doc = isGrayscale ? await this.loadUsableVariant(context) : undefined;
    if (!doc) {
      let sourceBytes = await getTemplateBytes();
      if (isGrayscale) {
        if (previewMode) {
          // Cut to the preview page budget BEFORE rasterizing.
          sourceBytes = await convertPdfToPreviewGrayscale(
            await this.sliceToPreviewLimit(sourceBytes),
          );
        } else {
          sourceBytes = await convertPdfToGrayscale(sourceBytes, {
            apiKey: context.grayscaleApiKey,
          });
        }
      }
      doc = await PDFDocument.load(sourceBytes);
    }

    const totalPages = doc.getPageCount();
    const pagesToCopy = previewMode
      ? Math.min(totalPages, DefaultHandler.PREVIEW_PAGE_LIMIT)
      : totalPages;

    const pageIndices = Array.from({ length: pagesToCopy }, (_, i) => i);
    const pages = await finalPdf.copyPages(doc, pageIndices);
    pages.forEach((page) => finalPdf.addPage(page));

    return { pagesAdded: pages.length };
  }

  async calculatePageCount(
    context: TagContext,
    getTemplateBytes: () => Promise<Uint8Array>,
  ): Promise<number> {
    const storedPageCount = context.moduleItem.pageCount;
    if (typeof storedPageCount === "number" && storedPageCount >= 0) {
      return storedPageCount;
    }
    // Legacy rows without metadata should use the same variant as the build
    // pass instead of downloading the original solely to count its pages.
    const variantDoc = context.isGrayscale
      ? await this.loadUsableVariant(context)
      : undefined;
    if (variantDoc) return variantDoc.getPageCount();
    return super.calculatePageCount(context, getTemplateBytes);
  }

  private async loadUsableVariant(
    context: TagContext,
  ): Promise<PDFDocument | undefined> {
    const fetchVariant = context.fetchOptionalPdfBytes ?? fetchPdfBytesOrNull;
    const bytes = await fetchVariant(context.moduleItem.grayscalePdfUrl);
    if (!bytes) return undefined;
    try {
      const doc = await PDFDocument.load(bytes);
      const pageCount = doc.getPageCount();
      const expectedCount = context.moduleItem.pageCount;
      if (
        pageCount === 0 ||
        (typeof expectedCount === "number" &&
          expectedCount >= 0 &&
          pageCount !== expectedCount)
      ) {
        return undefined;
      }
      return doc;
    } catch {
      return undefined;
    }
  }

  private async sliceToPreviewLimit(
    templateBytes: Uint8Array,
  ): Promise<Uint8Array> {
    const fullDoc = await PDFDocument.load(templateBytes);
    const totalPages = fullDoc.getPageCount();
    if (totalPages <= DefaultHandler.PREVIEW_PAGE_LIMIT) return templateBytes;

    const subsetDoc = await PDFDocument.create();
    const pageIndices = Array.from(
      { length: DefaultHandler.PREVIEW_PAGE_LIMIT },
      (_, i) => i,
    );
    const pages = await subsetDoc.copyPages(fullDoc, pageIndices);
    pages.forEach((page) => subsetDoc.addPage(page));
    return subsetDoc.save({ useObjectStreams: false, addDefaultPage: false });
  }
}

const defaultHandler = new DefaultHandler();
export default defaultHandler;
