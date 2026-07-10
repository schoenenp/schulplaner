import { PDFDocument } from "pdf-lib";
import type { ColorCode, ModuleId } from "./types";

// Import from modular utilities
import { registry } from "./handlers";
import { addPageNumbers, DEFAULT_PAGE_NUMBER_OPTIONS } from "./pagination";
import { addWatermark } from "./watermark";
import { finalizeDocument } from "./alignment";
import { fetchPdfBytes } from "./helpers";
import type {
  BookDetails,
  BookFormat,
  PDFModule,
  ProcessingOptions,
  Result,
  TagContext,
  DetailsItem,
} from "./types";

// --- Main PDFProcessor Class ---

class PDFProcessor {
  /**
   * Template bytes fetched during this processor's lifetime, keyed by URL.
   * Shared between the page-count pass and the build pass so a preview run
   * downloads every module at most once.
   */
  private readonly templateCache = new Map<string, Promise<Uint8Array>>();

  private getTemplateBytes(url: string): Promise<Uint8Array> {
    let cached = this.templateCache.get(url);
    if (!cached) {
      cached = fetchPdfBytes(url);
      this.templateCache.set(url, cached);
    }
    return cached;
  }

  /**
   * Start fetching every module PDF in parallel so the sequential processing
   * below never waits on the network for the next module.
   */
  private prefetchTemplates(modules: PDFModule[]): void {
    for (const moduleItem of modules) {
      void this.getTemplateBytes(moduleItem.pdfUrl).catch(() => {
        // fetchPdfBytes resolves with a blank-page fallback; this guard only
        // exists so an unexpected rejection cannot become unhandled.
      });
    }
  }

  /**
   * Calculates the final page counts for a full production document
   * without generating the entire PDF. Used for accurate price estimation.
   * Modules with stored page counts are counted without any network access.
   */
  public async calculateFullPageCounts(
    bookDetails: BookDetails,
    modules: PDFModule[],
    colorMap: Map<ModuleId, ColorCode> = new Map<ModuleId, ColorCode>(),
  ): Promise<{ fullPageCount: number; bPages: number; cPages: number }> {
    const { coverModule, sortedModules } = this.validateAndSortModules(modules);

    let calculatedPageCount = 0;
    let bPages = 0;
    let cPages = 0;

    // 1. Account for Cover (always 4 pages)
    calculatedPageCount += 4;
    const isCoverGrayscale = colorMap.get(coverModule.id) === 1;
    if (isCoverGrayscale) {
      bPages += 4;
    } else {
      cPages += 4;
    }

    // Handlers only read counts from the context here; one scratch document
    // satisfies the interface for every module.
    const scratchDoc = await PDFDocument.create();

    // 2. Account for all pages in content modules. Template bytes are only
    // fetched when a module carries no stored page count (legacy rows).
    for (const moduleItem of sortedModules) {
      const handler = registry.getOrDefault(moduleItem.type);

      const context: TagContext = {
        bookDetails,
        moduleItem,
        finalPdf: scratchDoc,
        format: "DIN A5",
        previewMode: false,
        isGrayscale: colorMap.get(moduleItem.id) === 1,
        currentPageCount: calculatedPageCount,
      };
      const getTemplateBytes = () => this.getTemplateBytes(moduleItem.pdfUrl);

      let modulePages: number;
      if (handler.calculatePageCount) {
        modulePages = await handler.calculatePageCount(
          context,
          getTemplateBytes,
        );
      } else if (typeof moduleItem.pageCount === "number") {
        modulePages = moduleItem.pageCount;
      } else {
        const doc = await PDFDocument.load(await getTemplateBytes());
        modulePages = doc.getPageCount();
      }

      calculatedPageCount += modulePages;
      const isGrayscale = colorMap.get(moduleItem.id) === 1;
      if (isGrayscale) {
        bPages += modulePages;
      } else {
        cPages += modulePages;
      }
    }

    // 3. Account for final blank alignment pages
    const remainder = calculatedPageCount % 4;
    if (remainder !== 0) {
      const pagesToAdd = 4 - remainder;
      calculatedPageCount += pagesToAdd;
      bPages += pagesToAdd; // Alignment pages are always blank (b/w)
    }

    return { fullPageCount: calculatedPageCount, bPages, cPages };
  }

  /**
   * Main processing method. Generates a PDF based on the provided options.
   */
  async processPdfModules(
    bookDetails: BookDetails,
    modules: PDFModule[],
    options: ProcessingOptions = {},
  ): Promise<Result> {
    const {
      addPageNumbers: shouldAddPageNumbers = true,
      pageNumberOptions = {},
      previewMode = false,
      addWatermark: shouldAddWatermark = false,
      format = "DIN A5",
      colorMap = new Map(),
      grayscaleApiKey,
    } = options;

    const pageNumOptions = {
      ...DEFAULT_PAGE_NUMBER_OPTIONS,
      ...pageNumberOptions,
    };

    const { coverModule, sortedModules } = this.validateAndSortModules(modules);

    // Overlap all template downloads with the sequential build below.
    this.prefetchTemplates([coverModule, ...sortedModules]);

    const finalPdf = await PDFDocument.create();

    const isCoverGrayscale = colorMap.get(coverModule.id) === 1;

    // Create shared context object
    const context: TagContext = {
      bookDetails,
      moduleItem: coverModule,
      finalPdf,
      format,
      previewMode,
      isGrayscale: isCoverGrayscale,
      grayscaleApiKey,
    };

    // Process cover first and capture back cover doc
    const coverHandler = registry.get("umschlag");
    if (!coverHandler) {
      throw new Error("Cover handler not found");
    }
    const coverResult = await this.runModuleStep(coverModule, async () => {
      const coverBytes = await this.getTemplateBytes(coverModule.pdfUrl);
      return coverHandler.process(
        { ...context, moduleItem: coverModule },
        coverBytes,
      );
    });

    // Store backCoverDoc from cover handler result
    const backCoverDoc = coverResult.backCoverDoc;

    let fullPageCount = 0;
    let bPages = 0;
    let cPages = 0;

    // Cover pages are 4 pages total
    if (isCoverGrayscale) {
      bPages += 4;
    } else {
      cPages += 4;
    }
    fullPageCount += 4;

    // Process content modules
    for (const moduleItem of sortedModules) {
      const handler = registry.getOrDefault(moduleItem.type);
      const isGrayscale = colorMap.get(moduleItem.id) === 1;

      const result = await this.runModuleStep(moduleItem, async () => {
        const templateBytes = await this.getTemplateBytes(moduleItem.pdfUrl);
        return handler.process(
          { ...context, moduleItem, isGrayscale },
          templateBytes,
        );
      });

      fullPageCount += result.pagesAdded;
      if (isGrayscale) {
        bPages += result.pagesAdded;
      } else {
        cPages += result.pagesAdded;
      }
    }

    // Add alignment pages and back cover
    const blankPagesAdded = await finalizeDocument(
      finalPdf,
      backCoverDoc,
      previewMode,
    );
    fullPageCount += blankPagesAdded;
    bPages += blankPagesAdded;

    if (shouldAddWatermark) {
      await addWatermark(finalPdf);
    }

    if (shouldAddPageNumbers) {
      addPageNumbers(finalPdf, pageNumOptions);
    }

    const result = await this.generateResult(
      finalPdf,
      previewMode,
      bPages,
      cPages,
    );
    result.isPreview = previewMode;
    result.details.fullPageCount = fullPageCount;

    return result;
  }

  /**
   * Runs one module's fetch/process step and rethrows failures with the
   * module's name so users can see which module broke the generation.
   */
  private async runModuleStep<T>(
    moduleItem: PDFModule,
    step: () => Promise<T>,
  ): Promise<T> {
    try {
      return await step();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const moduleRef = moduleItem.name
        ? `"${moduleItem.name}"`
        : `of type "${moduleItem.type}"`;
      throw new Error(`Module ${moduleRef}: ${reason}`, { cause: error });
    }
  }

  private validateAndSortModules(modules: PDFModule[]) {
    const coverModule = modules.find((m) => m.type === "umschlag");
    if (!coverModule) throw new Error("Cover module not found");

    const sortedModules = modules
      .filter((m) => m.type !== "umschlag")
      .sort((a, b) => a.idx - b.idx);

    return { coverModule, sortedModules };
  }

  private async generateResult(
    finalPdf: PDFDocument,
    previewMode: boolean,
    bPages: number,
    cPages: number,
  ): Promise<Result> {
    const saveOptions = previewMode
      ? { useObjectStreams: false, addDefaultPage: false, objectsPerTick: 50 }
      : { useObjectStreams: true, addDefaultPage: false };

    const pdfBytes = await finalPdf.save(saveOptions);

    return {
      pdfFile: pdfBytes,
      details: {
        pageCount: finalPdf.getPageCount(),
        isCMYK: false,
        bPages,
        cPages,
      },
    };
  }
}

// --- Factory Functions (Preserved API) ---

/**
 * Process PDF modules for production output.
 * This is the main entry point for generating final PDFs.
 */
export async function processPdfModules(
  bookDetails: BookDetails,
  modules: PDFModule[],
  options: {
    addPageNumbers?: boolean;
    addWatermark?: boolean;
    format?: BookFormat;
    colorMap?: Map<ModuleId, ColorCode>;
    grayscaleApiKey?: string;
  } = {},
): Promise<Result> {
  console.time("PDF Generation Time");
  try {
    const processor = new PDFProcessor();
    return await processor.processPdfModules(bookDetails, modules, {
      previewMode: false,
      addPageNumbers: options.addPageNumbers ?? true,
      addWatermark: options.addWatermark ?? false,
      format: options.format ?? "DIN A5",
      colorMap: options.colorMap,
      grayscaleApiKey: options.grayscaleApiKey,
    });
  } finally {
    console.timeEnd("PDF Generation Time");
  }
}

/**
 * Process PDF modules for preview output.
 * Generates a smaller preview PDF with accurate page count estimation.
 * Both passes share one processor so every module PDF is fetched at most once.
 */
export async function processPdfModulesPreview(
  bookDetails: BookDetails,
  modules: PDFModule[],
  options: {
    addPageNumbers?: boolean;
    addWatermark?: boolean;
    format?: BookFormat;
    colorMap?: Map<ModuleId, ColorCode>;
    grayscaleApiKey?: string;
  } = {},
): Promise<Result> {
  console.time("PDF Preview Generation Time");
  try {
    const processor = new PDFProcessor();

    // 1. Calculate the TRUE full page counts for an accurate price estimate.
    const fullCounts = await processor.calculateFullPageCounts(
      bookDetails,
      modules,
      options.colorMap,
    );

    // 2. Generate the SMALL, partial PDF for the visual preview.
    const previewResult = await processor.processPdfModules(
      bookDetails,
      modules,
      {
        previewMode: true,
        addPageNumbers: options.addPageNumbers ?? true,
        addWatermark: options.addWatermark ?? true,
        format: options.format ?? "DIN A5",
        colorMap: options.colorMap,
        grayscaleApiKey: options.grayscaleApiKey,
      },
    );

    // Override with accurate counts from full calculation
    previewResult.details.fullPageCount = fullCounts.fullPageCount;
    previewResult.details.bPages = fullCounts.bPages;
    previewResult.details.cPages = fullCounts.cPages;

    return previewResult;
  } finally {
    console.timeEnd("PDF Preview Generation Time");
  }
}

/**
 * Calculate full page counts for pricing without generating PDF output.
 */
export async function calculatePdfPageCounts(
  bookDetails: BookDetails,
  modules: PDFModule[],
  options: {
    colorMap?: Map<ModuleId, ColorCode>;
  } = {},
): Promise<{ fullPageCount: number; bPages: number; cPages: number }> {
  const processor = new PDFProcessor();
  return processor.calculateFullPageCounts(
    bookDetails,
    modules,
    options.colorMap,
  );
}

// Re-export types for backwards compatibility
export type { BookDetails, PDFModule, ProcessingOptions, Result, DetailsItem };
