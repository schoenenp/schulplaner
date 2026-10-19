import { createHash, randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { storageKey } from "./references";

let client: S3Client | undefined;
export function storageConfig() {
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.AWS_REGION?.trim();
  const endpoint = process.env.S3_ENDPOINT?.trim();
  if (!bucket || !region || !endpoint) throw new Error("S3_BUCKET, AWS_REGION and S3_ENDPOINT are required for object storage");
  const url = new URL(endpoint);
  const hetzner = /^([a-z0-9]+)\.your-objectstorage\.com$/.exec(url.hostname);
  const r2 = /^[a-z0-9]+(?:\.(?:eu|us|fedramp))?\.r2\.cloudflarestorage\.com$/.test(url.hostname);
  const aws = /^s3(?:\.dualstack)?(?:[.-][a-z0-9-]+)?\.amazonaws\.com(?:\.cn)?$/.test(url.hostname);
  if (url.protocol !== "https:" || !(hetzner || r2 || aws) || url.pathname !== "/" || url.search || url.hash || url.username || url.password || url.port) {
    throw new Error("S3_ENDPOINT must be an HTTPS Hetzner, Cloudflare R2 or AWS S3 service endpoint");
  }
  if (hetzner && region !== hetzner[1]) throw new Error("AWS_REGION must match the Hetzner endpoint location (for example fsn1)");
  const prefix = (process.env.S3_PREFIX ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (prefix && !prefix.split("/").every(segment => /^[a-zA-Z0-9._-]+$/.test(segment) && segment !== "." && segment !== "..")) {
    throw new Error("S3_PREFIX must contain safe slash-separated path segments");
  }
  return { bucket, region, endpoint, prefix };
}

/** Tenant namespace is physical only; database and browser references stay stable. */
export function storageObjectKey(src: string): string {
  const key = storageKey(src);
  const { prefix } = storageConfig();
  return prefix ? `${prefix}/${key}` : key;
}

export function storageClient() {
  const { region, endpoint } = storageConfig();
  // Credentials use the SDK provider chain (server-only AWS_* variables).
  // Keep virtual-hosted addressing, as recommended by Hetzner's SDK examples.
  return client ??= new S3Client({ region, endpoint, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" });
}

export function fileFormat(data: Uint8Array): { type: "PDF" | "IMAGE_PNG" | "IMAGE_JPEG"; contentType: string; extension: string } {
  const hex = Buffer.from(data.subarray(0, 8)).toString("hex");
  if (hex.startsWith("25504446")) return { type: "PDF", contentType: "application/pdf", extension: "pdf" };
  if (hex.startsWith("89504e470d0a1a0a")) return { type: "IMAGE_PNG", contentType: "image/png", extension: "png" };
  if (hex.startsWith("ffd8ff")) return { type: "IMAGE_JPEG", contentType: "image/jpeg", extension: "jpg" };
  throw new Error("Unsupported upload: expected PDF, PNG or JPEG");
}

export async function uploadStorageFiles(files: { data: Uint8Array; name: string }[]) {
  // Validate the complete batch before starting any writes.
  const prepared = files.map(file => ({ ...file, format: fileFormat(file.data) }));
  // Share identical bytes only within this upload. Independent uploads retain
  // separate private keys so one client's objects have no shared lifecycle.
  const uploadedKeys = new Map<string, string>();
  const uploaded = [];
  for (const file of prepared) {
    const digest = createHash("sha256").update(file.data).digest("hex");
    let key = uploadedKeys.get(digest);
    if (!key) {
      key = `storage/uploads/${randomUUID()}.${file.format.extension}`;
      await storageClient().send(new PutObjectCommand({
        Bucket: storageConfig().bucket, Key: storageObjectKey(`/${key}`), Body: file.data,
        ContentType: file.format.contentType, CacheControl: "private, no-store",
        Metadata: { sha256: digest, "books-upload": "1" },
      }));
      uploadedKeys.set(digest, key);
    }
    uploaded.push({ name: file.name, src: `/${key}`, type: file.format.type, size: file.data.byteLength });
  }
  return uploaded;
}

/** Server-only private read. Authorization happens in each app's route. */
export async function readStorageAsset(src: string, init?: RequestInit): Promise<Response> {
  const key = storageObjectKey(src);
  const requestHeaders = new Headers(init?.headers);
  const range = requestHeaders.get("Range") ?? undefined;
  const ifNoneMatch = requestHeaders.get("If-None-Match") ?? undefined;
  const modifiedSince = requestHeaders.get("If-Modified-Since");
  // Entity tags take precedence over dates. Invalid HTTP dates are ignored.
  const parsedDate = modifiedSince ? new Date(modifiedSince) : undefined;
  const ifModifiedSince = !ifNoneMatch && parsedDate && Number.isFinite(parsedDate.getTime())
    ? parsedDate
    : undefined;
  const headers = new Headers({ "Cache-Control": "private, no-cache, must-revalidate", "Accept-Ranges": "bytes" });
  try {
    const result = await storageClient().send(new GetObjectCommand({
      Bucket: storageConfig().bucket, Key: key, Range: range,
      IfNoneMatch: ifNoneMatch, IfModifiedSince: ifModifiedSince,
    }), { abortSignal: init?.signal ?? undefined });
    if (result.ContentType) headers.set("Content-Type", result.ContentType);
    if (result.ContentLength !== undefined) headers.set("Content-Length", String(result.ContentLength));
    if (result.ContentRange) headers.set("Content-Range", result.ContentRange);
    if (result.ContentDisposition) headers.set("Content-Disposition", result.ContentDisposition);
    if (result.ETag) headers.set("ETag", result.ETag);
    if (result.LastModified) headers.set("Last-Modified", result.LastModified.toUTCString());
    return new Response(result.Body?.transformToWebStream() ?? null, {
      status: result.ContentRange ? 206 : 200, headers,
    });
  } catch (error) {
    if (error instanceof S3ServiceException && [304, 404, 412, 416].includes(error.$metadata.httpStatusCode ?? 0)) {
      // The SDK throws for 304, despite it being a successful revalidation.
      // Copy only cache validators from the underlying HTTP response.
      const responseHeaders = error.$response?.headers as Record<string, string> | undefined;
      if (responseHeaders?.etag) headers.set("ETag", responseHeaders.etag);
      if (responseHeaders?.["last-modified"]) headers.set("Last-Modified", responseHeaders["last-modified"]);
      return new Response(null, { status: error.$metadata.httpStatusCode, headers });
    }
    throw error;
  }
}
