import { describe, expect, test, spyOn } from "bun:test";
import { GetObjectCommand, PutObjectCommand, S3ServiceException } from "@aws-sdk/client-s3";
import { fileFormat, readStorageAsset, storageClient, storageConfig, storageObjectKey, uploadStorageFiles } from "./server";
import { storageKey, storagePath } from "./references";

process.env.S3_BUCKET = "books-test";
process.env.AWS_REGION = "auto";
process.env.S3_ENDPOINT = "https://test.r2.cloudflarestorage.com";
process.env.S3_PREFIX = "";

describe("private object storage references", () => {
  test("maps old references and proxy URLs to bucket keys", () => {
    expect(storageKey("https://cdn.pirrot.de/storage/example.pdf")).toBe("storage/example.pdf");
    expect(storageKey("/api/cdn?src=%2Fstorage%2Fexample.pdf")).toBe("storage/example.pdf");
    expect(storageKey("/api/files/abc_123/content")).toBe("api/files/abc_123/content");
  });
  test("rejects traversal and unrelated origins", () => {
    for (const src of ["/storage/../secret", "/storage/%2e%2e/secret", "/storage/a?x=1", "https://evil.example/storage/test.pdf", "/api/files/abc/content/extra"]) {
      expect(storagePath(src)).toBeNull();
    }
  });
  test("accepts jurisdiction-specific R2 endpoints", () => {
    process.env.S3_ENDPOINT = "https://test.eu.r2.cloudflarestorage.com";
    expect(storageConfig().endpoint).toContain(".eu.");
    process.env.S3_ENDPOINT = "https://test.r2.cloudflarestorage.com";
  });
});

describe("object storage configuration", () => {
  test("accepts Hetzner locations and AWS S3 endpoints", () => {
    try {
      for (const region of ["fsn1", "nbg1", "hel1"]) {
        process.env.AWS_REGION = region;
        process.env.S3_ENDPOINT = `https://${region}.your-objectstorage.com`;
        expect(storageConfig().region).toBe(region);
      }
      process.env.AWS_REGION = "eu-central-1";
      process.env.S3_ENDPOINT = "https://s3.eu-central-1.amazonaws.com";
      expect(storageConfig().endpoint).toBe("https://s3.eu-central-1.amazonaws.com");
    } finally {
      process.env.AWS_REGION = "auto";
      process.env.S3_ENDPOINT = "https://test.r2.cloudflarestorage.com";
    }
  });

  test("rejects unsafe endpoints and mismatched Hetzner regions", () => {
    try {
      process.env.AWS_REGION = "fsn1";
      for (const endpoint of [
        "http://fsn1.your-objectstorage.com",
        "https://fsn1.your-objectstorage.com.evil.example",
        "https://evil.example",
        "https://user:secret@fsn1.your-objectstorage.com",
        "https://fsn1.your-objectstorage.com/bucket",
        "https://fsn1.your-objectstorage.com?key=secret",
        "https://fsn1.your-objectstorage.com#bucket",
        "https://fsn1.your-objectstorage.com:8443",
        "https://bucket.fsn1.your-objectstorage.com",
        "https://nbg1.your-objectstorage.com",
      ]) {
        process.env.S3_ENDPOINT = endpoint;
        expect(() => storageConfig()).toThrow();
      }
      process.env.S3_ENDPOINT = "https://fsn1.your-objectstorage.com";
      process.env.AWS_REGION = " ";
      expect(() => storageConfig()).toThrow("AWS_REGION");
    } finally {
      process.env.AWS_REGION = "auto";
      process.env.S3_ENDPOINT = "https://test.r2.cloudflarestorage.com";
    }
  });

  test("namespaces physical keys without changing references", () => {
    try {
      expect(storageObjectKey("/storage/notizen.pdf")).toBe("storage/notizen.pdf");
      process.env.S3_PREFIX = "/clients/foto-raabe/";
      expect(storageConfig().prefix).toBe("clients/foto-raabe");
      expect(storageObjectKey("/storage/notizen.pdf")).toBe("clients/foto-raabe/storage/notizen.pdf");
      process.env.S3_PREFIX = "clients/pirrot";
      expect(storageObjectKey("https://cdn.pirrot.de/storage/notizen.pdf")).toBe("clients/pirrot/storage/notizen.pdf");
      for (const prefix of ["clients/../other", "clients/./other", "clients//other", "clients/%2e%2e", "clients?key=value", "clients\\other"]) {
        process.env.S3_PREFIX = prefix;
        expect(() => storageConfig()).toThrow("S3_PREFIX");
      }
    } finally { process.env.S3_PREFIX = ""; }
  });
});

test("validates file signatures instead of trusting filenames", () => {
  expect(fileFormat(Buffer.from("%PDF-1.7")).type).toBe("PDF");
  expect(fileFormat(Buffer.from("89504e470d0a1a0a", "hex")).type).toBe("IMAGE_PNG");
  expect(fileFormat(Buffer.from("ffd8ffe0", "hex")).type).toBe("IMAGE_JPEG");
  expect(() => fileFormat(Buffer.from("<script>"))).toThrow("Unsupported upload");
});

test("uploads private objects with unique keys and preserves request order and names", async () => {
  const send = spyOn(storageClient(), "send").mockResolvedValue({} as never);
  try {
    const files = await uploadStorageFiles([{ name: "file_0.pdf", data: Buffer.from("%PDF-1.7") }, { name: "thumb_0.png", data: Buffer.from("89504e470d0a1a0a", "hex") }]);
    expect(files.map(f => f.name)).toEqual(["file_0.pdf", "thumb_0.png"]);
    expect(files[0]?.src).toMatch(/^\/storage\/uploads\/[a-f0-9-]+\.pdf$/);
    expect(files[1]?.type).toBe("IMAGE_PNG");
    const command = send.mock.calls[0]![0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input.Bucket).toBe("books-test");
    expect(command.input.ContentType).toBe("application/pdf");
    expect(command.input.Metadata?.["books-upload"]).toBe("1");
    expect(command.input.Metadata?.sha256).toBe(new Bun.CryptoHasher("sha256").update(Buffer.from("%PDF-1.7")).digest("hex"));
    expect(command.input.ACL).toBeUndefined();
    send.mockClear();
    await expect(uploadStorageFiles([{ name: "a.pdf", data: Buffer.from("%PDF") }, { name: "bad.pdf", data: Buffer.from("bad") }])).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  } finally { send.mockRestore(); }
});

test("reuses identical bytes within one upload batch while keeping independent uploads separate", async () => {
  const send = spyOn(storageClient(), "send").mockResolvedValue({} as never);
  try {
    const data = Buffer.from("%PDF-1.7 identical upload");
    const files = await uploadStorageFiles([
      { name: "first.pdf", data },
      { name: "second.pdf", data: new Uint8Array(data) },
      { name: "other.pdf", data: Buffer.from("%PDF-1.7 other upload") },
    ]);
    expect(send).toHaveBeenCalledTimes(2);
    expect(files.map(file => file.name)).toEqual(["first.pdf", "second.pdf", "other.pdf"]);
    expect(files[0]?.src).toBe(files[1]?.src);
    expect(files[2]?.src).not.toBe(files[0]?.src);
    const next = await uploadStorageFiles([{ name: "first.pdf", data }]);
    expect(send).toHaveBeenCalledTimes(3);
    expect(next[0]?.src).not.toBe(files[0]?.src);
  } finally { send.mockRestore(); }
});

test("uploads and reads use the configured tenant prefix, while uploaded src remains relative", async () => {
  const send = spyOn(storageClient(), "send").mockResolvedValue({} as never);
  try {
    process.env.S3_PREFIX = "clients/foto-raabe";
    const [file] = await uploadStorageFiles([{ name: "module.pdf", data: Buffer.from("%PDF-1.7") }]);
    expect(file?.src).toMatch(/^\/storage\/uploads\/[a-f0-9-]+\.pdf$/);
    expect((send.mock.calls[0]![0] as PutObjectCommand).input.Key).toBe(`clients/foto-raabe${file!.src}`);
    await readStorageAsset(file!.src);
    expect((send.mock.calls[1]![0] as GetObjectCommand).input.Key).toBe(`clients/foto-raabe${file!.src}`);
    process.env.S3_PREFIX = "clients/pirrot";
    await readStorageAsset(file!.src);
    expect((send.mock.calls[2]![0] as GetObjectCommand).input.Key).toBe(`clients/pirrot${file!.src}`);
  } finally {
    process.env.S3_PREFIX = "";
    send.mockRestore();
  }
});

test("streams private ranged reads with content headers", async () => {
  const send = spyOn(storageClient(), "send").mockResolvedValue({
    ContentType: "application/pdf", ContentLength: 4, ContentRange: "bytes 0-3/8",
    ETag: '"content-hash"', LastModified: new Date("2026-10-01T10:00:00Z"),
    Body: { transformToWebStream: () => new Blob(["%PDF"]).stream() },
  } as never);
  try {
    const response = await readStorageAsset("/storage/a.pdf", { headers: { Range: "bytes=0-3" } });
    expect(response.status).toBe(206);
    expect(await response.text()).toBe("%PDF");
    expect(response.headers.get("Content-Range")).toBe("bytes 0-3/8");
    expect(response.headers.get("ETag")).toBe('"content-hash"');
    expect(response.headers.get("Last-Modified")).toBe("Thu, 01 Oct 2026 10:00:00 GMT");
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache, must-revalidate");
    expect((send.mock.calls[0]![0] as GetObjectCommand).input.Range).toBe("bytes=0-3");
  } finally { send.mockRestore(); }
});

test("forwards cache validators with entity tags taking precedence over dates", async () => {
  const send = spyOn(storageClient(), "send").mockResolvedValue({} as never);
  try {
    const date = "Thu, 01 Oct 2026 10:00:00 GMT";
    await readStorageAsset("/storage/a.pdf", { headers: { "If-None-Match": '"content-hash"', "If-Modified-Since": date } });
    const tagged = (send.mock.calls[0]![0] as GetObjectCommand).input;
    expect(tagged.IfNoneMatch).toBe('"content-hash"');
    expect(tagged.IfModifiedSince).toBeUndefined();
    await readStorageAsset("/storage/a.pdf", { headers: { "If-Modified-Since": date } });
    expect((send.mock.calls[1]![0] as GetObjectCommand).input.IfModifiedSince?.toUTCString()).toBe(date);
    await readStorageAsset("/storage/a.pdf", { headers: { "If-Modified-Since": "invalid-date" } });
    expect((send.mock.calls[2]![0] as GetObjectCommand).input.IfModifiedSince).toBeUndefined();
  } finally { send.mockRestore(); }
});

test("returns an empty 304 with cache validators when the SDK reports not modified", async () => {
  const error = new S3ServiceException({ name: "NotModified", message: "not modified", $fault: "client", $metadata: { httpStatusCode: 304 } });
  Object.assign(error, { $response: { headers: { etag: '"content-hash"', "last-modified": "Thu, 01 Oct 2026 10:00:00 GMT" } } });
  const send = spyOn(storageClient(), "send").mockRejectedValue(error as never);
  try {
    const response = await readStorageAsset("/storage/a.pdf", { headers: { "If-None-Match": '"content-hash"' } });
    expect(response.status).toBe(304);
    expect(response.body).toBeNull();
    expect(response.headers.get("ETag")).toBe('"content-hash"');
    expect(response.headers.get("Last-Modified")).toBe("Thu, 01 Oct 2026 10:00:00 GMT");
    expect(response.headers.get("Content-Length")).toBeNull();
  } finally { send.mockRestore(); }
});

test("returns missing-object, precondition and invalid-range statuses", async () => {
  const send = spyOn(storageClient(), "send");
  try {
    for (const status of [404, 412, 416]) {
      send.mockRejectedValueOnce(new S3ServiceException({ name: "StorageError", message: "test", $fault: "client", $metadata: { httpStatusCode: status } }) as never);
      expect((await readStorageAsset("/storage/missing.pdf")).status).toBe(status);
    }
  } finally { send.mockRestore(); }
});
