/**
 * Injectable logger so the pipeline reports through whichever structured
 * logger the consuming app uses. Falls back to the console until an app's
 * wrapper calls setPdfPipelineLogger.
 */
export interface PdfPipelineLogger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

let activeLogger: PdfPipelineLogger = {
  debug: (message, meta) => console.debug(message, meta ?? ""),
  info: (message, meta) => console.info(message, meta ?? ""),
  warn: (message, meta) => console.warn(message, meta ?? ""),
  error: (message, meta) => console.error(message, meta ?? ""),
};

export function setPdfPipelineLogger(logger: PdfPipelineLogger): void {
  activeLogger = logger;
}

/** Stable facade; modules import this and always hit the active logger. */
export const logger: PdfPipelineLogger = {
  debug: (message, meta) => activeLogger.debug(message, meta),
  info: (message, meta) => activeLogger.info(message, meta),
  warn: (message, meta) => activeLogger.warn(message, meta),
  error: (message, meta) => activeLogger.error(message, meta),
};
