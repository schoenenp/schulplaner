import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

type Session = { user: { id: string; role: string; email?: string } } | null;
let session: Session;
let fileExists: boolean;
let upstream: Response;
let storageError: Error | undefined;
const events: string[] = [];

const authenticate = mock(async () => {
  events.push("auth");
  return session;
});
const findFile = mock(async (_query: unknown) => {
  events.push("db");
  return fileExists ? { id: "file_1" } : null;
});
const readAsset = mock(async (_src: string, _init?: RequestInit) => {
  events.push("storage");
  if (storageError) throw storageError;
  return upstream;
});

mock.module("@/server/auth", () => ({ auth: authenticate }));
mock.module("@/server/db", () => ({ db: { file: { findFirst: findFile } } }));
mock.module("books-storage", () => ({ readStorageAsset: readAsset }));
const { GET } = await import("./route");

const assetPath = "/storage/uploads/test.pdf";
const modified = "Wed, 07 Oct 2026 12:00:00 GMT";
function request(headers?: HeadersInit, path = assetPath) {
  return new Request(
    `https://app.example.test/api/cdn?src=${encodeURIComponent(path)}`,
    { headers },
  );
}

beforeEach(() => {
  session = { user: { id: "user_1", role: "STAFF" } };
  fileExists = true;
  storageError = undefined;
  upstream = new Response("PDF", {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": "3",
      "Content-Disposition": "inline",
      "Accept-Ranges": "bytes",
      ETag: '"revision-1"',
      "Last-Modified": modified,
    },
  });
  events.length = 0;
  authenticate.mockClear();
  findFile.mockClear();
  readAsset.mockClear();
});
afterAll(() => mock.restore());

describe("authorized object revalidation", () => {
  it("rejects malformed references before accessing authentication or storage", async () => {
    const result = await GET(request({ "If-None-Match": '"revision-1"' }, "/storage/../private.pdf"));
    expect(result.status).toBe(404);
    expect(events).toEqual([]);
  });

  it("rechecks file access before considering a matching validator", async () => {
    fileExists = false;
    upstream = new Response(null, { status: 304 });
    const result = await GET(request({ "If-None-Match": '"revision-1"' }));
    expect(result.status).toBe(404);
    expect(events).toEqual(["auth", "db"]);
    expect(findFile.mock.calls[0]?.[0]).toMatchObject({
      where: { modules: { some: { deletedAt: null } } },
    });
  });

  it("returns a bodyless 304 only after authentication and file authorization", async () => {
    upstream = new Response(null, {
      status: 304,
      headers: { ETag: '"revision-1"', "Last-Modified": modified },
    });
    const result = await GET(request({
      "If-None-Match": '"revision-1"',
      "If-Modified-Since": modified,
    }));
    expect(events).toEqual(["auth", "db", "storage"]);
    expect(result.status).toBe(304);
    expect(await result.text()).toBe("");
    expect(result.headers.get("etag")).toBe('"revision-1"');
    expect(result.headers.get("last-modified")).toBe(modified);
    expect(result.headers.get("content-length")).toBeNull();
    expect(result.headers.get("cache-control")).toBe("private, no-cache, must-revalidate");
    expect(result.headers.get("vary")).toBe("Cookie");
    const sent = new Headers(readAsset.mock.calls[0]?.[1]?.headers);
    expect(sent.get("if-none-match")).toBe('"revision-1"');
    expect(sent.get("if-modified-since")).toBe(modified);
  });

  it("streams an updated object with validators and mandatory private revalidation", async () => {
    const result = await GET(request({ "If-None-Match": '"old-revision"' }));
    expect(result.status).toBe(200);
    expect(await result.text()).toBe("PDF");
    expect(result.headers.get("content-type")).toBe("application/pdf");
    expect(result.headers.get("content-length")).toBe("3");
    expect(result.headers.get("content-disposition")).toBe("inline");
    expect(result.headers.get("etag")).toBe('"revision-1"');
    expect(result.headers.get("last-modified")).toBe(modified);
    expect(result.headers.get("cache-control")).toBe("private, no-cache, must-revalidate");
    expect(result.headers.get("vary")).toBe("Cookie");
    expect(result.headers.get("x-content-type-options")).toBe("nosniff");
    expect(readAsset.mock.calls[0]?.[0]).toBe(assetPath);
  });

  it("serves a full representation for conditional ranges to avoid joining different versions", async () => {
    const result = await GET(request({ Range: "bytes=1-2", "If-Range": '"old-revision"' }));
    const sent = new Headers(readAsset.mock.calls[0]?.[1]?.headers);
    expect(sent.get("range")).toBeNull();
    expect(result.status).toBe(200);
    expect(await result.text()).toBe("PDF");
  });

  it("preserves byte-range requests and partial-content responses", async () => {
    upstream = new Response("DF", {
      status: 206,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Range": "bytes 1-2/3",
        "Content-Length": "2",
        "Accept-Ranges": "bytes",
        ETag: '"revision-1"',
      },
    });
    const result = await GET(request({ Range: "bytes=1-2" }));
    const sent = new Headers(readAsset.mock.calls[0]?.[1]?.headers);
    expect(sent.get("range")).toBe("bytes=1-2");
    expect(result.status).toBe(206);
    expect(await result.text()).toBe("DF");
    expect(result.headers.get("content-range")).toBe("bytes 1-2/3");
    expect(result.headers.get("content-length")).toBe("2");
    expect(result.headers.get("accept-ranges")).toBe("bytes");
    expect(result.headers.get("etag")).toBe('"revision-1"');
  });

  it.each([404, 416, 500])("preserves storage failure semantics for status %s", async (status) => {
    upstream = new Response(null, { status });
    const result = await GET(request());
    expect(result.status).toBe(status === 500 ? 502 : status);
    expect(await result.text()).toBe("File unavailable");
  });

  it("does not substitute cached content when storage fails", async () => {
    storageError = new Error("unavailable");
    const result = await GET(request({ "If-None-Match": '"revision-1"' }));
    expect(result.status).toBe(503);
  });

  it.each([null, { user: { id: "user_1", role: "USER", email: "user@example.test" } }])(
    "rejects non-staff sessions even when the browser has a cached object",
    async (rejectedSession) => {
      session = rejectedSession;
      const result = await GET(request({ "If-None-Match": '"revision-1"' }));
      expect(result.status).toBe(403);
      expect(events).toEqual(["auth"]);
    },
  );

  it("requires staff access even for the default notes object", async () => {
    session = null;
    expect((await GET(request({}, "/storage/notizen.pdf"))).status).toBe(403);
    expect(events).toEqual(["auth"]);
  });
});
