import { storagePath } from "books-storage/references";

/** Browser reads use app authorization; server reads use private object storage. */
export async function fetchCdnAsset(src: string, init?: RequestInit): Promise<Response> {
  const path = storagePath(src);
  if (!path) {
    if (/^https?:\/\//i.test(src) && new URL(src).hostname === "cdn.pirrot.de") {
      throw new Error("Unsupported legacy asset reference; migrate it to object storage first");
    }
    return fetch(src, init);
  }
  if (typeof window !== "undefined") {
    // Revalidate with the app on every read so access revocation takes effect.
    return fetch(`/api/cdn?src=${encodeURIComponent(path)}`, { ...init, cache: "no-cache" });
  }
  // Keep the AWS SDK and credential resolution out of browser bundles.
  const { readStorageAsset } = await import("books-storage");
  return readStorageAsset(path, init);
}
