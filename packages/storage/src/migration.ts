import { createHash } from "node:crypto";
import {
  GetBucketVersioningCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { storagePath } from "./references";
import { fileFormat } from "./server";

export const MAX_MIGRATION_BYTES = 128 * 1024 * 1024;
export type MigrationMode = "dry-run" | "apply" | "verify";

export function migrationMode(args: string[]): MigrationMode {
  if (args.some(arg => !["--apply", "--verify"].includes(arg)) || new Set(args).size !== args.length || args.length > 1) {
    throw new Error("Usage: storage:migrate [--apply | --verify] (default: dry run)");
  }
  return args[0] === "--apply" ? "apply" : args[0] === "--verify" ? "verify" : "dry-run";
}

/** No active/deleted/relation filters: retained files may still need their bytes. */
export function migrationReferences(
  files: Iterable<{ src: string; srcGrayscale: string | null }>,
  customCover?: string,
) {
  const references = new Set<string>(["/storage/notizen.pdf"]);
  const unsupported = new Set<string>();
  const add = (src: string | null | undefined) => {
    if (!src) return;
    let path: string | null = null;
    try { path = storagePath(src); } catch { /* Report malformed references below. */ }
    if (path) references.add(path);
    else unsupported.add(src);
  };
  for (const file of files) { add(file.src); add(file.srcGrayscale); }
  add(customCover);
  return { references: [...references].sort(), unsupported: [...unsupported].sort() };
}

export function legacyStorageOrigin(value?: string): string {
  if (!value) throw new Error("LEGACY_STORAGE_URL is required to read legacy files");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("LEGACY_STORAGE_URL must be an HTTPS origin"); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("LEGACY_STORAGE_URL must be an HTTPS origin without credentials, path, query or fragment");
  }
  return url.origin;
}

/** Bound streamed responses too; Content-Length alone cannot protect memory. */
export async function readMigrationBytes(
  body: ReadableStream<Uint8Array> | null,
  contentLength: number | null,
  limit = MAX_MIGRATION_BYTES,
): Promise<Uint8Array> {
  if (!body) throw new Error("Empty download body");
  if (contentLength !== null && (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > limit)) {
    await body.cancel();
    throw new Error(`Invalid or excessive download size (limit ${limit} bytes)`);
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > limit) throw new Error(`Download exceeds ${limit} byte limit`);
      chunks.push(next.value);
    }
    if (contentLength !== null && total !== contentLength) throw new Error("Download size mismatch");
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const bytes = Buffer.concat(chunks, total);
  fileFormat(bytes); // Reject HTML login/error pages, even when served as HTTP 200.
  return bytes;
}

function digest(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
function httpStatus(error: unknown) {
  return (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
}

type MigrationOptions = {
  mode: MigrationMode;
  bucket: string;
  objectKey: (reference: string) => string;
  client?: Pick<S3Client, "send">;
  legacyOrigin?: string;
  legacyApiKey?: string;
  fetch?: typeof globalThis.fetch;
  log?: (message: string) => void;
};

/** Read-only unless mode is apply. Never updates database references or removes objects. */
export async function migrateStorage(references: readonly string[], options: MigrationOptions) {
  const log = options.log ?? console.log;
  const stats = { planned: references.length, copied: 0, skipped: 0, verified: 0, failed: 0 };
  if (options.mode === "dry-run") {
    for (const ref of references) log(`Plan: ${options.objectKey(ref)}`);
    return stats;
  }
  const client = options.client;
  if (!client) throw new Error("An S3 client is required for apply/verify");
  if (options.mode === "apply") {
    // Hetzner does not support conditional PUT on versioned buckets. Fail before
    // any copies instead of silently losing our no-overwrite guarantee.
    const versioning = await client.send(new GetBucketVersioningCommand({ Bucket: options.bucket }));
    if (versioning.Status) throw new Error(`Migration requires a bucket that has never enabled versioning (status: ${versioning.Status}). No objects were written.`);
  }
  const readSource = async (reference: string) => {
    const origin = legacyStorageOrigin(options.legacyOrigin);
    const response = await (options.fetch ?? globalThis.fetch)(new URL(reference, origin), {
      headers: options.legacyApiKey ? { "X-API-Key": options.legacyApiKey } : {},
      redirect: "error", signal: AbortSignal.timeout(120_000),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error(`Legacy download returned ${response.status}`);
    }
    // Fetch transparently decompresses HTTP bodies, so encoded Content-Length
    // must not be compared to the resulting decoded bytes.
    const length = response.headers.get("Content-Encoding") ? null : response.headers.get("Content-Length");
    return readMigrationBytes(response.body, length === null ? null : Number(length));
  };
  const readTarget = async (key: string) => {
    const result = await client.send(new GetObjectCommand({ Bucket: options.bucket, Key: key }), {
      abortSignal: AbortSignal.timeout(120_000),
    });
    const bytes = await readMigrationBytes(result.Body?.transformToWebStream() ?? null, result.ContentLength ?? null);
    const sha256 = digest(bytes);
    if (result.Metadata?.sha256 && result.Metadata.sha256 !== sha256) throw new Error("Stored SHA-256 metadata does not match target bytes");
    return {
      sha256, hasChecksum: Boolean(result.Metadata?.sha256),
      nativeUpload: result.Metadata?.["books-upload"] === "1",
    };
  };
  for (const reference of references) {
    const key = options.objectKey(reference);
    try {
      if (options.mode === "verify") {
        const target = await readTarget(key);
        // A path alone cannot establish provenance: legacy uploads may also use
        // /storage/uploads/. Only the application's metadata marker does so.
        if (!target.nativeUpload) {
          const source = await readSource(reference);
          if (target.sha256 !== digest(source)) throw new Error("Source and target SHA-256 mismatch");
        }
        stats.verified++;
        log(`Verified: ${key}${target.nativeUpload ? target.hasChecksum ? " (stored SHA-256)" : " (readable; no historical checksum)" : " (legacy SHA-256 match)"}`);
        continue;
      }
      try {
        await client.send(new HeadObjectCommand({ Bucket: options.bucket, Key: key }));
        stats.skipped++;
        log(`Already present: ${key} (use --verify to check contents)`);
        continue;
      } catch (error) { if (httpStatus(error) !== 404) throw error; }
      const bytes = await readSource(reference);
      const sha256 = digest(bytes);
      try {
        await client.send(new PutObjectCommand({
          Bucket: options.bucket, Key: key, Body: bytes,
          ContentType: fileFormat(bytes).contentType, CacheControl: "private, no-store",
          Metadata: { sha256 }, IfNoneMatch: "*",
        }));
      } catch (error) {
        if (httpStatus(error) !== 412) throw error;
        // Another writer won the race. Validate their object without overwriting.
        if ((await readTarget(key)).sha256 !== sha256) throw new Error("Concurrent target object differs from legacy source");
        stats.skipped++;
        stats.verified++;
        log(`Concurrent copy verified: ${key}`);
        continue;
      }
      if ((await readTarget(key)).sha256 !== sha256) throw new Error("Copied SHA-256 mismatch");
      stats.copied++;
      stats.verified++;
      log(`Copied and SHA-256 verified: ${key}`);
    } catch (error) {
      stats.failed++;
      log(`Failed: ${key}: ${error instanceof Error ? error.message : "Unknown storage error"}`);
    }
  }
  return stats;
}
