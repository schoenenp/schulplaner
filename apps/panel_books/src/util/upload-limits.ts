export const MAX_UPLOAD_FILE_MB = 10;
export const MAX_UPLOAD_FILE_BYTES = MAX_UPLOAD_FILE_MB * 1024 * 1024;

export function uploadLimitMessage(fileName?: string): string {
  const prefix = fileName ? `"${fileName}" ist` : "Die Datei ist";
  return `${prefix} zu groß. Maximal erlaubt sind ${MAX_UPLOAD_FILE_MB} MB.`;
}
