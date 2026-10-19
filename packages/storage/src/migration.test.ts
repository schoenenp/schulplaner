import { createHash } from "node:crypto";
import { describe, expect, mock, test } from "bun:test";
import {
  GetBucketVersioningCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, type S3Client,
} from "@aws-sdk/client-s3";
import {
  legacyStorageOrigin, migrateStorage, migrationMode, migrationReferences, readMigrationBytes,
} from "./migration";
import { storageObjectKey } from "./server";

process.env.S3_BUCKET = "books-test";
process.env.AWS_REGION = "nbg1";
process.env.S3_ENDPOINT = "https://nbg1.your-objectstorage.com";
process.env.S3_PREFIX = "clients/foto-raabe";

const PDF = Buffer.from("%PDF-1.7 original bytes");
const checksum = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const storageError = (status: number) => Object.assign(new Error(`S3 ${status}`), { $metadata: { httpStatusCode: status } });
type Command = GetBucketVersioningCommand | GetObjectCommand | HeadObjectCommand | PutObjectCommand;

function fixture(options: {
  existing?: boolean; versioning?: "Enabled" | "Suspended"; target?: Uint8Array;
  headStatus?: number; storedChecksum?: string; nativeUpload?: boolean; race?: boolean; source?: string; sourceStatus?: number;
} = {}) {
  const commands: Command[] = [];
  const logs: string[] = [];
  let target = options.target ?? PDF;
  let storedChecksum = options.storedChecksum;
  const send = mock(async (command: Command) => {
    commands.push(command);
    if (command instanceof GetBucketVersioningCommand) return { Status: options.versioning };
    if (command instanceof HeadObjectCommand) {
      if (options.headStatus) throw storageError(options.headStatus);
      if (!options.existing) throw storageError(404);
      return { ContentLength: target.byteLength };
    }
    if (command instanceof PutObjectCommand) {
      if (options.race) throw storageError(412);
      target = options.target ?? command.input.Body as Uint8Array;
      storedChecksum = command.input.Metadata?.sha256;
      return {};
    }
    if (command instanceof GetObjectCommand) return {
      Body: { transformToWebStream: () => new Response(Buffer.from(target)).body },
      ContentLength: target.byteLength,
      Metadata: { ...(storedChecksum ? { sha256: storedChecksum } : {}), ...(options.nativeUpload ? { "books-upload": "1" } : {}) },
    };
    throw new Error("Unexpected command");
  });
  const sourceFetch = mock(async (_url: URL | RequestInfo, _init?: RequestInit) => new Response(options.source ?? PDF, { status: options.sourceStatus ?? 200 }));
  return {
    commands, logs, sourceFetch,
    options: {
      bucket: "books-test", objectKey: storageObjectKey,
      client: { send } as unknown as Pick<S3Client, "send">,
      fetch: sourceFetch as unknown as typeof fetch,
      legacyOrigin: "https://cdn.pirrot.de",
      log: (line: string) => logs.push(line),
    },
  };
}

describe("migration inventory and configuration", () => {
  test("inventories unique color/grayscale paths, retained files, notes and the configured cover", () => {
    const files = [
      { src: "https://cdn.pirrot.de/storage/original.pdf", srcGrayscale: "/storage/gray.pdf", deletedAt: new Date(), bookId: null },
      { src: "/api/cdn?src=%2Fstorage%2Foriginal.pdf", srcGrayscale: null },
      { src: "https://external.example/photo.jpg", srcGrayscale: "/storage/../unsafe.pdf" },
      { src: "https://[invalid", srcGrayscale: null },
    ];
    expect(migrationReferences(files, "/storage/cover.pdf")).toEqual({
      references: ["/storage/cover.pdf", "/storage/gray.pdf", "/storage/notizen.pdf", "/storage/original.pdf"],
      unsupported: ["/storage/../unsafe.pdf", "https://[invalid", "https://external.example/photo.jpg"],
    });
    expect(migrationReferences([], "https://external.example/cover.pdf").unsupported).toEqual(["https://external.example/cover.pdf"]);
  });

  test("defaults to dry run and rejects conflicting/unknown flags", () => {
    expect(migrationMode([])).toBe("dry-run");
    expect(migrationMode(["--apply"])).toBe("apply");
    expect(migrationMode(["--verify"])).toBe("verify");
    for (const args of [["--apply", "--verify"], ["--apply", "--apply"], ["--force"]]) {
      expect(() => migrationMode(args)).toThrow("Usage");
    }
  });

  test("requires an HTTPS source origin with no credentials or path", () => {
    expect(legacyStorageOrigin("https://cdn.pirrot.de/")).toBe("https://cdn.pirrot.de");
    for (const source of [undefined, "not-a-url", "http://cdn.pirrot.de", "https://u:p@cdn.pirrot.de", "https://cdn.pirrot.de/storage", "https://cdn.pirrot.de?token=x", "https://cdn.pirrot.de#files"]) {
      expect(() => legacyStorageOrigin(source)).toThrow("LEGACY_STORAGE_URL");
    }
  });

  test("dry run calculates tenant keys without any network requests", async () => {
    const f = fixture();
    const result = await migrateStorage(["/storage/a.pdf"], { ...f.options, mode: "dry-run" });
    expect(result).toEqual({ planned: 1, copied: 0, skipped: 0, verified: 0, failed: 0 });
    expect(f.logs).toEqual(["Plan: clients/foto-raabe/storage/a.pdf"]);
    expect(f.commands).toHaveLength(0);
    expect(f.sourceFetch).not.toHaveBeenCalled();
  });
});

describe("safe migration writes", () => {
  test("refuses enabled and suspended versioning before reading or writing any object", async () => {
    for (const versioning of ["Enabled", "Suspended"] as const) {
      const f = fixture({ versioning });
      await expect(migrateStorage(["/storage/a.pdf"], { ...f.options, mode: "apply" })).rejects.toThrow("never enabled versioning");
      expect(f.commands).toHaveLength(1);
      expect(f.commands[0]).toBeInstanceOf(GetBucketVersioningCommand);
      expect(f.sourceFetch).not.toHaveBeenCalled();
    }
  });

  test("writes a missing object conditionally under its tenant prefix and verifies SHA-256 bytes", async () => {
    const f = fixture();
    const result = await migrateStorage(["/storage/a.pdf"], { ...f.options, mode: "apply" });
    expect(result).toEqual({ planned: 1, copied: 1, skipped: 0, verified: 1, failed: 0 });
    const put = f.commands.find(command => command instanceof PutObjectCommand)!;
    expect(put.input).toMatchObject({
      Bucket: "books-test", Key: "clients/foto-raabe/storage/a.pdf", IfNoneMatch: "*",
      ContentType: "application/pdf", CacheControl: "private, no-store", Metadata: { sha256: checksum(PDF) },
    });
    expect(put.input.ACL).toBeUndefined();
    expect(f.commands.at(-1)).toBeInstanceOf(GetObjectCommand);
    const [url, init] = f.sourceFetch.mock.calls[0]!;
    expect(String(url)).toBe("https://cdn.pirrot.de/storage/a.pdf");
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init?.headers).has("X-API-Key")).toBe(false);
  });

  test("adds the legacy API header only when configured", async () => {
    const f = fixture();
    await migrateStorage(["/storage/a.pdf"], { ...f.options, mode: "apply", legacyApiKey: "fixture-key" });
    expect(new Headers(f.sourceFetch.mock.calls[0]![1]?.headers).get("X-API-Key")).toBe("fixture-key");
  });

  test("skips existing objects without downloading their legacy source", async () => {
    const f = fixture({ existing: true });
    const result = await migrateStorage(["/storage/a.pdf"], { ...f.options, mode: "apply", legacyOrigin: undefined });
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(f.commands).toHaveLength(2);
    expect(f.sourceFetch).not.toHaveBeenCalled();
  });

  test("does not treat an authorization error as a missing object", async () => {
    const f = fixture({ headStatus: 403 });
    expect((await migrateStorage(["/storage/a.pdf"], { ...f.options, mode: "apply" })).failed).toBe(1);
    expect(f.sourceFetch).not.toHaveBeenCalled();
    expect(f.commands.some(command => command instanceof PutObjectCommand)).toBe(false);
  });

  test("rejects HTML and partial HTTP downloads before writing", async () => {
    for (const options of [{ source: "<html>Login required</html>" }, { sourceStatus: 206 }]) {
      const f = fixture(options);
      expect((await migrateStorage(["/storage/a.pdf"], { ...f.options, mode: "apply" })).failed).toBe(1);
      expect(f.commands.some(command => command instanceof PutObjectCommand)).toBe(false);
    }
  });

  test("detects corruption even when the copied byte length is unchanged", async () => {
    const f = fixture({ target: Buffer.from("%PDF-1.7 tampered bytes") });
    expect(Buffer.byteLength("%PDF-1.7 tampered bytes")).toBe(PDF.byteLength);
    const result = await migrateStorage(["/storage/a.pdf"], { ...f.options, mode: "apply" });
    expect(result.failed).toBe(1);
    expect(result.copied).toBe(0);
    expect(f.logs.join("\n")).toContain("SHA-256");
  });

  test("a concurrent conditional-write failure verifies the winner without retrying an overwrite", async () => {
    const f = fixture({ race: true });
    const result = await migrateStorage(["/storage/a.pdf"], { ...f.options, mode: "apply" });
    expect(result).toEqual({ planned: 1, copied: 0, skipped: 1, verified: 1, failed: 0 });
    expect(f.commands.filter(command => command instanceof PutObjectCommand)).toHaveLength(1);
  });

  test("copies legacy upload paths rather than assuming their directory identifies app-native uploads", async () => {
    const f = fixture();
    const result = await migrateStorage(["/storage/uploads/new.pdf"], { ...f.options, mode: "apply" });
    expect(result.copied).toBe(1);
    expect(result.failed).toBe(0);
    expect(String(f.sourceFetch.mock.calls[0]![0])).toBe("https://cdn.pirrot.de/storage/uploads/new.pdf");
  });
});

describe("read-only verification", () => {
  test("compares existing legacy bytes against the source without issuing writes", async () => {
    const f = fixture();
    const result = await migrateStorage(["/storage/a.pdf"], { ...f.options, mode: "verify" });
    expect(result.verified).toBe(1);
    expect(f.commands).toHaveLength(1);
    expect(f.commands[0]).toBeInstanceOf(GetObjectCommand);
    expect(f.sourceFetch).toHaveBeenCalledTimes(1);
  });

  test("rejects legacy target content that differs from source even without checksum metadata", async () => {
    const f = fixture({ target: Buffer.from("%PDF-1.7 tampered bytes") });
    expect((await migrateStorage(["/storage/a.pdf"], { ...f.options, mode: "verify" })).failed).toBe(1);
    expect(f.logs.join("\n")).toContain("Source and target SHA-256 mismatch");
  });

  test("an unmarked upload path still requires comparison to the legacy source", async () => {
    const f = fixture({ target: Buffer.from("%PDF-1.7 tampered bytes") });
    const result = await migrateStorage(["/storage/uploads/old.pdf"], { ...f.options, mode: "verify" });
    expect(result.failed).toBe(1);
    expect(f.sourceFetch).toHaveBeenCalledTimes(1);
    expect(f.logs.join("\n")).toContain("Source and target SHA-256 mismatch");
  });

  test("verifies new uploads without legacy access and distinguishes historical checksum availability", async () => {
    for (const storedChecksum of [undefined, checksum(PDF)]) {
      const f = fixture({ storedChecksum, nativeUpload: true });
      const result = await migrateStorage(["/storage/uploads/new.pdf"], { ...f.options, mode: "verify", legacyOrigin: undefined });
      expect(result.verified).toBe(1);
      expect(result.failed).toBe(0);
      expect(f.sourceFetch).not.toHaveBeenCalled();
      expect(f.logs.join("\n")).toContain(storedChecksum ? "stored SHA-256" : "no historical checksum");
    }
  });

  test("rejects a new upload whose stored SHA-256 no longer matches", async () => {
    const f = fixture({ storedChecksum: "0".repeat(64), nativeUpload: true });
    const result = await migrateStorage(["/storage/uploads/new.pdf"], { ...f.options, mode: "verify" });
    expect(result.failed).toBe(1);
    expect(f.sourceFetch).not.toHaveBeenCalled();
  });
});

test("bounded downloads reject declared oversize, actual oversize, truncation and unsupported signatures", async () => {
  await expect(readMigrationBytes(new Response(PDF).body, PDF.byteLength, 8)).rejects.toThrow("size");
  const cancel = mock(() => {});
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(PDF.subarray(0, 8)); controller.enqueue(PDF.subarray(8)); }, cancel,
  });
  await expect(readMigrationBytes(stream, null, 8)).rejects.toThrow("limit");
  expect(cancel).toHaveBeenCalledTimes(1);
  await expect(readMigrationBytes(new Response(PDF).body, PDF.byteLength + 1)).rejects.toThrow("size mismatch");
  await expect(readMigrationBytes(new Response("<html>Error</html>").body, null)).rejects.toThrow("Unsupported upload");
  expect(await readMigrationBytes(new Response(PDF).body, null)).toEqual(PDF);
});
