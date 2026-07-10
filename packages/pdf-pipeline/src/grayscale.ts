import { logger } from "./logger";

const GRAYSCALE_ENDPOINT = "https://api.ghost.miomideal.com/api/process/grayscale";
const LOCAL_PROXY_ENDPOINT = "/api/process/grayscale";
const MAX_GRAYSCALE_CACHE_ENTRIES = 128;
const MAX_CONCURRENT_GRAYSCALE_REQUESTS = 3;
const MIN_BYTES_FOR_TRANSPORT_COMPRESSION = 1_000_000;

/** Hard upload limit enforced by the ghost-api (rejects anything above 20 MiB). */
export const GRAYSCALE_UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024;

export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type GrayscaleOptions = {
  apiKey?: string;
  /** Human-readable source (e.g. module name / batch part) included in error messages. */
  label?: string;
};

const grayscaleCache = new Map<string, Promise<Uint8Array>>();
const grayscaleRequestQueue: Array<() => void> = [];
let activeGrayscaleRequests = 0;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function shouldLogGrayscaleTimings(): boolean {
  if (typeof process !== "undefined" && process.env?.NODE_ENV) {
    return process.env.NODE_ENV !== "production";
  }
  return true;
}

function hashBytes(bytes: Uint8Array): string {
  // FNV-1a 32-bit hash for stable in-memory cache keys.
  let hash = 0x811c9dc5;
  for (const value of bytes) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function createCacheKey(pdfBytes: Uint8Array): string {
  return `${isBrowser() ? "browser" : "server"}:${pdfBytes.length}:${hashBytes(pdfBytes)}`;
}

function setCacheEntry(key: string, value: Promise<Uint8Array>) {
  if (!grayscaleCache.has(key) && grayscaleCache.size >= MAX_GRAYSCALE_CACHE_ENTRIES) {
    const oldest = grayscaleCache.keys().next().value;
    if (oldest) {
      grayscaleCache.delete(oldest);
    }
  }
  grayscaleCache.set(key, value);
}

async function acquireGrayscaleSlot(): Promise<void> {
  if (activeGrayscaleRequests < MAX_CONCURRENT_GRAYSCALE_REQUESTS) {
    activeGrayscaleRequests += 1;
    return;
  }

  await new Promise<void>((resolve) => {
    grayscaleRequestQueue.push(resolve);
  });
  activeGrayscaleRequests += 1;
}

function releaseGrayscaleSlot(): void {
  activeGrayscaleRequests = Math.max(0, activeGrayscaleRequests - 1);
  const next = grayscaleRequestQueue.shift();
  if (next) {
    next();
  }
}

async function runWithGrayscaleSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquireGrayscaleSlot();
  try {
    return await fn();
  } finally {
    releaseGrayscaleSlot();
  }
}

async function prepareTransportPdfBytes(
  pdfBytes: Uint8Array,
): Promise<{
  payload: Uint8Array;
  compressed: boolean;
  prepareMs: number;
  inputBytes: number;
  outputBytes: number;
  ratio: number;
  method: "original" | "optimized" | "rebuilt";
}> {
  const inputBytes = pdfBytes.byteLength;
  if (inputBytes < MIN_BYTES_FOR_TRANSPORT_COMPRESSION) {
    return {
      payload: pdfBytes,
      compressed: false,
      prepareMs: 0,
      inputBytes,
      outputBytes: inputBytes,
      ratio: 1,
      method: "original",
    };
  }

  const prepareStartMs = nowMs();
  try {
    // Dynamic import keeps initial load light and only pays this cost for large PDFs.
    const { PDFDocument } = await import("pdf-lib");
    const sourceDoc = await PDFDocument.load(pdfBytes, {
      updateMetadata: false,
    });

    const optimizedBytes = await sourceDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      objectsPerTick: 50,
    });

    let bestPayload: Uint8Array = new Uint8Array(optimizedBytes);
    let bestMethod: "original" | "optimized" | "rebuilt" = "optimized";

    if (bestPayload.byteLength >= inputBytes) {
      bestPayload = cloneBytes(pdfBytes);
      bestMethod = "original";
    }

    const outputBytes = bestPayload.byteLength;
    const prepareMs = nowMs() - prepareStartMs;
    const ratio = inputBytes > 0 ? outputBytes / inputBytes : 1;

    return {
      payload: bestPayload,
      compressed: outputBytes < inputBytes,
      prepareMs,
      inputBytes,
      outputBytes,
      ratio,
      method: bestMethod,
    };
  } catch {
    return {
      payload: cloneBytes(pdfBytes),
      compressed: false,
      prepareMs: nowMs() - prepareStartMs,
      inputBytes,
      outputBytes: inputBytes,
      ratio: 1,
      method: "original",
    };
  }
}

export async function convertPdfToGrayscale(
  pdfBytes: Uint8Array,
  options: GrayscaleOptions = {},
): Promise<Uint8Array> {
  const cacheKey = createCacheKey(pdfBytes);
  const cached = grayscaleCache.get(cacheKey);
  if (cached) {
    return cloneBytes(await cached);
  }

  const conversionPromise = (async () => {
    const requestStartAt = nowMs();
    const prepared = await prepareTransportPdfBytes(pdfBytes);

    if (prepared.payload.byteLength > GRAYSCALE_UPLOAD_LIMIT_BYTES) {
      const source = options.label ? ` for ${options.label}` : "";
      throw new Error(
        `Grayscale PDF${source} is ${formatMegabytes(prepared.payload.byteLength)}, ` +
          `limit is ${formatMegabytes(GRAYSCALE_UPLOAD_LIMIT_BYTES)}`,
      );
    }

    const result = await runWithGrayscaleSlot(async () => {
      const formData = new FormData();
      const pdfBlob = new Blob([prepared.payload.slice().buffer], {
        type: "application/pdf",
      });
      formData.append("file", pdfBlob, "document.pdf");

      let response: Response;
      const fetchStartAt = nowMs();

      if (isBrowser()) {
        const debugHeaders: Record<string, string> = {};
        if (shouldLogGrayscaleTimings()) {
          debugHeaders["X-Grayscale-Input-Bytes"] = String(prepared.inputBytes);
          debugHeaders["X-Grayscale-Payload-Bytes"] = String(prepared.outputBytes);
          debugHeaders["X-Grayscale-Compressed"] = prepared.compressed ? "1" : "0";
          debugHeaders["X-Grayscale-Compression-Method"] = prepared.method;
          debugHeaders["X-Grayscale-Compression-Ratio"] = prepared.ratio.toFixed(3);
        }

        response = await fetch(LOCAL_PROXY_ENDPOINT, {
          method: "POST",
          headers: debugHeaders,
          body: formData,
        });
      } else {
        if (!options.apiKey) {
          throw new Error(
            "Missing GHOST_GRAYSCALE_API_KEY for server-side grayscale conversion",
          );
        }

        response = await fetch(GRAYSCALE_ENDPOINT, {
          method: "POST",
          headers: {
            "X-API-Key": options.apiKey,
          },
          body: formData,
        });
      }

      if (!response.ok) {
        let detail = "";
        try {
          detail = await response.text();
        } catch {
          detail = "";
        }
        // The local proxy already prefixes upstream errors; avoid doubling it.
        const trimmedDetail = detail
          .trim()
          .replace(/^Grayscale conversion failed:\s*/, "");
        const source = options.label ? ` (${options.label})` : "";
        const message = trimmedDetail
          ? `Grayscale conversion failed${source}: ${trimmedDetail}`
          : `Grayscale conversion failed${source}`;
        throw new Error(message);
      }

      const responseHeadersAt = nowMs();
      const arrayBuffer = await response.arrayBuffer();
      const completedAt = nowMs();
      const output = new Uint8Array(arrayBuffer);

      if (shouldLogGrayscaleTimings()) {
        const fetchMs = responseHeadersAt - fetchStartAt;
        const readMs = completedAt - responseHeadersAt;
        const totalMs = completedAt - requestStartAt;
        logger.debug("grayscale_conversion_timing", {
          inBytes: prepared.inputBytes,
          payloadBytes: prepared.outputBytes,
          outBytes: output.byteLength,
          compressed: prepared.compressed,
          method: prepared.method,
          ratio: Number(prepared.ratio.toFixed(3)),
          prepareMs: Number(prepared.prepareMs.toFixed(1)),
          fetchMs: Number(fetchMs.toFixed(1)),
          readMs: Number(readMs.toFixed(1)),
          totalMs: Number(totalMs.toFixed(1)),
        });
      }

      return output;
    });

    return result;
  })();

  setCacheEntry(cacheKey, conversionPromise);

  try {
    return cloneBytes(await conversionPromise);
  } catch (error) {
    grayscaleCache.delete(cacheKey);
    throw error;
  }
}
