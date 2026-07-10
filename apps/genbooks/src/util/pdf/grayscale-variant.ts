import "server-only";
import { env } from "@/env";
import { logger } from "@/util/logger";
import { GRAYSCALE_UPLOAD_LIMIT_BYTES, formatMegabytes } from "pdf-pipeline";

const GRAYSCALE_ENDPOINT =
  "https://api.ghost.miomideal.com/api/process/grayscale";

/**
 * Convert an uploaded module PDF to its print-quality grayscale variant.
 *
 * Runs once at upload time so book generation can fetch the stored variant
 * instead of round-tripping every module through the grayscale API on every
 * generation. Returns undefined when conversion is unavailable (no API key,
 * file above the API's upload limit, upstream error) — the caller stores no
 * variant and generation falls back to on-the-fly conversion.
 */
export async function createGrayscaleVariant(
  pdfBytes: Uint8Array,
): Promise<Uint8Array | undefined> {
  if (!env.GHOST_GRAYSCALE_API_KEY) {
    logger.warn("grayscale_variant_skipped_no_api_key", {});
    return undefined;
  }

  if (pdfBytes.byteLength > GRAYSCALE_UPLOAD_LIMIT_BYTES) {
    logger.warn("grayscale_variant_skipped_too_large", {
      size: formatMegabytes(pdfBytes.byteLength),
      limit: formatMegabytes(GRAYSCALE_UPLOAD_LIMIT_BYTES),
    });
    return undefined;
  }

  try {
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([pdfBytes.slice().buffer], { type: "application/pdf" }),
      "document.pdf",
    );

    const response = await fetch(GRAYSCALE_ENDPOINT, {
      method: "POST",
      headers: { "X-API-Key": env.GHOST_GRAYSCALE_API_KEY },
      body: formData,
    });

    if (!response.ok) {
      let detail = "";
      try {
        detail = (await response.text()).slice(0, 300);
      } catch {
        detail = "";
      }
      logger.warn("grayscale_variant_upstream_error", {
        status: response.status,
        detail,
      });
      return undefined;
    }

    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    logger.warn("grayscale_variant_request_failed", { error });
    return undefined;
  }
}
