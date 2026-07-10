/**
 * PDF Processing Pipeline (shared by genbooks and panel_books)
 *
 * Plugin-based architecture for assembling printable school planner books
 * from PDF module templates.
 *
 * Main exports:
 * - processPdfModules: Generate production PDFs
 * - processPdfModulesPreview: Generate preview PDFs with accurate page counts
 * - calculatePdfPageCounts: Price-relevant page counts without generating
 *
 * App integration:
 * Consume this package through the app's `@/util/pdf` wrapper, which wires
 * setPdfPipelineLogger and setHolidayProvider before re-exporting.
 *
 * Handler system:
 * - registry: Access to the handler registry
 * - BaseHandler: Base class for creating new handlers
 *
 * To add a new handler:
 * 1. Create handlers/your-type.handler.ts extending BaseHandler
 * 2. Import and add to handlers/index.ts allHandlers array
 */

// Main processing functions (backwards compatible)
export {
  processPdfModules,
  processPdfModulesPreview,
  calculatePdfPageCounts,
} from "./converter";

// App integration points
export { setPdfPipelineLogger, type PdfPipelineLogger } from "./logger";
export {
  setHolidayProvider,
  type HolidayProvider,
  type HolidayQuery,
} from "./holidays";

// Types
export type {
  BookDetails,
  BookFormat,
  ColorCode,
  DateItem,
  DetailsItem,
  HandlerResult,
  ModuleHandler,
  ModuleId,
  PDFModule,
  PageNumberOptions,
  ProcessingOptions,
  Result,
  TagContext,
  TagDefinition,
} from "./types";

// Handler system for advanced usage
export { registry, BaseHandler } from "./handlers";

// Utilities (for use in custom handlers)
export {
  formatDate,
  normalizeDate,
  generateWeekDates,
  fetchPdfBytes,
  fetchPdfBytesOrNull,
  getBlankPagePdfBytes,
  getPageSizeWithBleed,
  getA4WithBleeding,
  PAGE_DIMENSIONS,
} from "./helpers";

// Grayscale utilities (conversion, limits, preview rasterizer)
export {
  convertPdfToGrayscale,
  GRAYSCALE_UPLOAD_LIMIT_BYTES,
  formatMegabytes,
} from "./grayscale";
export { convertPdfToPreviewGrayscale } from "./preview-grayscale";

// Individual utilities (for advanced customization)
export { addPageNumbers, addPageNumberToPage } from "./pagination";
export { addWatermark } from "./watermark";
export { finalizeDocument, addAlignmentPageIfNeeded } from "./alignment";
export {
  readTemplateFieldSpecs,
  drawFieldText,
  computeOverlayLayout,
  getOverlayFont,
  type OverlayFieldSpec,
} from "./template-overlay";
