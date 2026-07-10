import { env } from "@/env";
import { logger } from "@/util/logger";

export const runtime = "nodejs";

const GRAYSCALE_ENDPOINT =
  "https://api.ghost.miomideal.com/api/process/grayscale";

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function shouldLogProxyTimings(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function POST(request: Request): Promise<Response> {
  const requestStartAt = nowMs();

  if (!env.GHOST_GRAYSCALE_API_KEY) {
    return new Response("Missing GHOST_GRAYSCALE_API_KEY", { status: 500 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response("Invalid form data", { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return new Response("Missing PDF file", { status: 400 });
  }

  const clientInputBytes = request.headers.get("x-grayscale-input-bytes") ?? "unknown";
  const clientPayloadBytes =
    request.headers.get("x-grayscale-payload-bytes") ?? "unknown";
  const clientCompressed = request.headers.get("x-grayscale-compressed") ?? "unknown";
  const clientCompressionMethod =
    request.headers.get("x-grayscale-compression-method") ?? "unknown";
  const clientCompressionRatio =
    request.headers.get("x-grayscale-compression-ratio") ?? "unknown";

  const upstreamForm = new FormData();
  const filename = file instanceof File && file.name ? file.name : "document.pdf";
  upstreamForm.append("file", file, filename);
  upstreamForm.append("mode", "preview")
  upstreamForm.append("engine", "mupdf")
  const upstreamFetchStartAt = nowMs();
  const response = await fetch(GRAYSCALE_ENDPOINT, {
    method: "POST",
    headers: {
      "X-API-Key": env.GHOST_GRAYSCALE_API_KEY,
    },
    body: upstreamForm,
  });
  const upstreamHeadersAt = nowMs();

  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      detail = "";
    }
    const message = detail.trim()
      ? `Grayscale conversion failed: ${detail}`
      : "Grayscale conversion failed";

    if (shouldLogProxyTimings()) {
      const totalMs = nowMs() - requestStartAt;
      const upstreamMs = upstreamHeadersAt - upstreamFetchStartAt;
      logger.warn("grayscale_proxy_upstream_error", {
        status: response.status,
        inBytes: file.size,
        clientInputBytes,
        clientPayloadBytes,
        clientCompressed,
        clientCompressionMethod,
        clientCompressionRatio,
        upstreamMs: Number(upstreamMs.toFixed(1)),
        totalMs: Number(totalMs.toFixed(1)),
        detail: message,
      });
    }

    return new Response(message, { status: 502 });
  }

  const responseReadStartAt = nowMs();
  const arrayBuffer = await response.arrayBuffer();
  const completedAt = nowMs();

  if (shouldLogProxyTimings()) {
    const upstreamMs = upstreamHeadersAt - upstreamFetchStartAt;
    const readMs = completedAt - responseReadStartAt;
    const totalMs = completedAt - requestStartAt;
    logger.info("grayscale_proxy_ok", {
      status: 200,
      inBytes: file.size,
      clientInputBytes,
      clientPayloadBytes,
      clientCompressed,
      clientCompressionMethod,
      clientCompressionRatio,
      outBytes: arrayBuffer.byteLength,
      upstreamMs: Number(upstreamMs.toFixed(1)),
      readMs: Number(readMs.toFixed(1)),
      totalMs: Number(totalMs.toFixed(1)),
    });
  }

  return new Response(arrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
    },
  });
}
