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
    const { finalPdf, previewMode, isGrayscale } = context;

    let sourceBytes = templateBytes;
    if (isGrayscale) {
      // Prefer the print-quality variant stored at upload time; conversion
      // (API or preview rasterizer) only runs for legacy modules without one.
      const variantBytes = await fetchPdfBytesOrNull(
        context.moduleItem.grayscalePdfUrl,
      );
      if (variantBytes) {
        sourceBytes = variantBytes;
      } else if (previewMode) {
        // Cut to the preview page budget BEFORE rasterizing so a large
        // module never rasterizes pages that get discarded anyway.
        sourceBytes = await convertPdfToPreviewGrayscale(
          await this.sliceToPreviewLimit(templateBytes),
        );
      } else {
        sourceBytes = await convertPdfToGrayscale(templateBytes, {
          apiKey: context.grayscaleApiKey,
        });
      }
    }

    const doc = await PDFDocument.load(sourceBytes);

    const totalPages = doc.getPageCount();
    const pagesToCopy = previewMode
      ? Math.min(totalPages, DefaultHandler.PREVIEW_PAGE_LIMIT)
      : totalPages;

    const pageIndices = Array.from({ length: pagesToCopy }, (_, i) => i);
    const pages = await finalPdf.copyPages(doc, pageIndices);
    pages.forEach((page) => finalPdf.addPage(page));

    return { pagesAdded: pages.length };
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
