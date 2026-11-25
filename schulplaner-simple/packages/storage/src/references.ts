/** Stable private references; legacy paths map to the same keys after migration. */
export function storagePath(src: string): string | null {
  let path = src;
  if (src.startsWith("/api/cdn?")) {
    path = new URL(src, "https://app.invalid").searchParams.get("src") ?? "";
  } else if (/^https?:\/\//i.test(src)) {
    const url = new URL(src);
    if (url.hostname !== "cdn.pirrot.de") return null;
    path = url.pathname;
  }
  if (path.includes("..")) return null;
  return /^\/(?:storage\/[a-zA-Z0-9._/-]+|api\/files\/[a-zA-Z0-9_-]+\/content)$/.test(path)
    ? path
    : null;
}

export function storageKey(src: string): string {
  const path = storagePath(src);
  if (!path) throw new Error("Invalid storage reference");
  return path.slice(1);
}
