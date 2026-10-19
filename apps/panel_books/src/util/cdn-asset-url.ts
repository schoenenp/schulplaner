import { storagePath } from "books-storage/references";

/** Private files are read through the app authorization route. */
export function cdnAssetUrl(src: string, base = ""): string {
  if (!src || src.startsWith("/api/cdn?")) return src;
  const path = storagePath(src);
  if (path) return `/api/cdn?src=${encodeURIComponent(path)}`;
  if (/^https?:\/\//i.test(src) || src.startsWith("/")) return src;
  return `${base.replace(/\/$/, "")}/${src}`;
}
