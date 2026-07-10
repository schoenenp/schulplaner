/**
 * App wrapper around the shared pdf-pipeline package.
 *
 * Wires the pipeline to this app's structured logger and holiday lookup,
 * then re-exports the full pipeline surface. Always import the pipeline
 * through this module (not from "pdf-pipeline" directly) so the providers
 * are guaranteed to be configured.
 */
import { setHolidayProvider, setPdfPipelineLogger } from "pdf-pipeline";
import { logger } from "@/util/logger";
import { getHolidays } from "@/util/book/functions";

setPdfPipelineLogger(logger);
setHolidayProvider(getHolidays);

export * from "pdf-pipeline";
