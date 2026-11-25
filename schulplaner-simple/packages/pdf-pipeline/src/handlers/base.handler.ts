import type { PDFDocument, PDFForm } from "pdf-lib";
import type {
  ModuleHandler,
  TagDefinition,
  TagContext,
  HandlerResult,
} from "../types";
import { logger } from "../logger";

/**
 * Abstract base class for module handlers.
 * Provides common functionality for tag filling and validation.
 *
 * To create a new handler:
 * 1. Extend this class
 * 2. Define moduleType (e.g., "kalender")
 * 3. Define tags array with field mappings
 * 4. Implement process() method
 * 5. Export as default: `export default new MyHandler()`
 * 6. Import in handlers/index.ts and add to allHandlers array
 */
export abstract class BaseHandler implements ModuleHandler {
  /** Module type identifier - must match the type name in the database */
  abstract readonly moduleType: string;

  /** Tag definitions for form fields this handler manages */
  abstract readonly tags: TagDefinition[];

  /**
   * Validate that required form fields exist in the PDF.
   * Override this method for custom validation logic.
   */
  async validate(doc: PDFDocument): Promise<boolean> {
    const form = doc.getForm();
    const requiredTags = this.tags.filter((t) => t.required);

    for (const tag of requiredTags) {
      try {
        form.getTextField(tag.fieldName);
      } catch {
        logger.warn("required_pdf_field_missing", {
          fieldName: tag.fieldName,
          moduleType: this.moduleType,
        });
        return false;
      }
    }
    return true;
  }

  /**
   * Fill all defined tags in the form using the provided context.
   * Silently skips fields that don't exist in the form.
   */
  protected fillTags(form: PDFForm, context: TagContext): void {
    for (const tag of this.tags) {
      try {
        const field = form.getTextField(tag.fieldName);
        const value = tag.getValue(context);
        if (value !== undefined && value !== null) {
          field.setText(value);
        }
      } catch {
        // Field not found - this is expected for optional fields
        // Only log in development if needed for debugging
      }
    }
  }

  /**
   * Process the module and add pages to the final PDF.
   * Must be implemented by each handler.
   *
   * @param context - Processing context with book details, final PDF, etc.
   * @param templateBytes - Raw PDF bytes of the module template
   * @returns HandlerResult with pagesAdded and optional backCoverDoc
   */
  abstract process(
    context: TagContext,
    templateBytes: Uint8Array,
  ): Promise<HandlerResult>;

  /**
   * Calculate expected page count without generating the PDF.
   * Override for modules with dynamic page counts (like planners).
   * Uses the page count stored with the module file when available and only
   * falls back to downloading and parsing the PDF for legacy rows.
   */
  async calculatePageCount(
    context: TagContext,
    getTemplateBytes: () => Promise<Uint8Array>,
  ): Promise<number> {
    const storedPageCount = context.moduleItem.pageCount;
    if (typeof storedPageCount === "number" && storedPageCount >= 0) {
      return storedPageCount;
    }
    // Dynamic import to avoid circular dependencies
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(await getTemplateBytes());
    return doc.getPageCount();
  }
}
