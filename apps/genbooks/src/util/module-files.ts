type ModuleFileLike = {
  name?: string | null;
  type?: string | null;
};

const LEGACY_PDF_NAME_PREFIXES = ["file_", "DATEI-", "file-"];
const CUSTOM_COVER_IMAGE_PREFIXES = ["cover_image_", "cover-image_"];
const IMAGE_FILE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".svg",
  ".avif",
];

function normalizeFileName(file: ModuleFileLike): string {
  return (file.name ?? "").toLowerCase();
}

export function isThumbnailFile(file: ModuleFileLike): boolean {
  const fileName = normalizeFileName(file);
  return fileName.startsWith("thumb_") || fileName.startsWith("thumbnail_");
}

export function isCoverImageFile(file: ModuleFileLike): boolean {
  const fileName = normalizeFileName(file);
  if (isThumbnailFile(file)) {
    return false;
  }

  if (
    CUSTOM_COVER_IMAGE_PREFIXES.some((prefix) =>
      fileName.startsWith(prefix.toLowerCase()),
    )
  ) {
    return true;
  }

  return hasImageExtension(fileName) && file.type !== "PDF";
}

function hasImageExtension(fileName: string): boolean {
  return IMAGE_FILE_EXTENSIONS.some((ext) => fileName.endsWith(ext));
}

export function isModulePdfFile(file: ModuleFileLike): boolean {
  const fileName = normalizeFileName(file);

  // Legacy datasets may store thumbnail rows with type=PDF by mistake.
  // Guard against those cases so we don't pick preview images as module PDFs.
  if (isThumbnailFile(file) || hasImageExtension(fileName)) {
    return false;
  }

  if (fileName.endsWith(".pdf")) {
    return true;
  }

  return LEGACY_PDF_NAME_PREFIXES.some((prefix) =>
    fileName.startsWith(prefix.toLowerCase()),
  ) || file.type === "PDF";
}

function getModulePdfFileScore(file: ModuleFileLike): number {
  if (!isModulePdfFile(file)) {
    return Number.NEGATIVE_INFINITY;
  }

  const fileName = normalizeFileName(file);
  let score = 0;

  if (fileName.endsWith(".pdf")) score += 4;
  if (
    LEGACY_PDF_NAME_PREFIXES.some((prefix) =>
      fileName.startsWith(prefix.toLowerCase()),
    )
  ) {
    score += 3;
  }
  if (file.type === "PDF") score += 2;

  return score;
}

export function pickModulePdfFile<T extends ModuleFileLike>(
  files: readonly T[],
): T | undefined {
  let selected: T | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const file of files) {
    const score = getModulePdfFileScore(file);
    if (score > bestScore) {
      bestScore = score;
      selected = file;
    }
  }

  return selected;
}

export function pickCoverImageFile<T extends ModuleFileLike>(
  files: readonly T[],
): T | undefined {
  for (const file of files) {
    if (isCoverImageFile(file)) {
      return file;
    }
  }

  return undefined;
}
