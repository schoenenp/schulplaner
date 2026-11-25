import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

const readAsset = mock(async (_src: string, _init?: RequestInit) => new Response("stored"));
mock.module("books-storage", () => ({ readStorageAsset: readAsset }));
const { fetchCdnAsset } = await import("./cdn-fetch");
const fetchSpy = spyOn(globalThis, "fetch");
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
const path = "/storage/uploads/test.pdf";

beforeEach(() => {
  readAsset.mockClear();
  fetchSpy.mockClear();
  fetchSpy.mockResolvedValue(new Response("fetched"));
});
afterEach(() => {
  if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
  else Reflect.deleteProperty(globalThis, "window");
});
afterAll(() => {
  fetchSpy.mockRestore();
  mock.restore();
});

describe("private CDN access", () => {
  it.each([
    path,
    `https://cdn.pirrot.de${path}`,
    `/api/cdn?src=${encodeURIComponent(path)}`,
  ])("always revalidates browser reads through authorization for %s", async (src) => {
    Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
    const controller = new AbortController();
    await fetchCdnAsset(src, {
      cache: "force-cache",
      headers: { Range: "bytes=0-1" },
      signal: controller.signal,
    });
    expect(fetchSpy.mock.calls[0]?.[0]).toBe(`/api/cdn?src=${encodeURIComponent(path)}`);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-cache",
      headers: { Range: "bytes=0-1" },
      signal: controller.signal,
    });
    expect(readAsset).not.toHaveBeenCalled();
  });

  it("reads private objects directly on the server without the legacy gateway", async () => {
    Reflect.deleteProperty(globalThis, "window");
    const init = { headers: { "If-None-Match": '"revision-1"' } };
    const result = await fetchCdnAsset(path, init);
    expect(await result.text()).toBe("stored");
    expect(readAsset).toHaveBeenCalledWith(path, init);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps external assets working with their original request options", async () => {
    const src = "https://assets.example.test/watermark.png";
    const init = { cache: "no-store" as const };
    await fetchCdnAsset(src, init);
    expect(fetchSpy).toHaveBeenCalledWith(src, init);
    expect(readAsset).not.toHaveBeenCalled();
  });

  it("does not silently read unsupported paths from the legacy CDN", async () => {
    await expect(fetchCdnAsset("https://cdn.pirrot.de/other/file.pdf")).rejects.toThrow(
      "Unsupported legacy asset reference",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(readAsset).not.toHaveBeenCalled();
  });
});
