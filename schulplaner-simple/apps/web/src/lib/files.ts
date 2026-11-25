export function fileUrl(src: string) {
  return `/api/datei?src=${encodeURIComponent(src)}`;
}
