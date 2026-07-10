const CHARS = "abcdefghjkmnpqrstuvwxyz23456789";

export function generateShortId(length = 6): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return result;
}

export const Naming = {
  book: (): string => `BUCH-${generateShortId()}`,

  bookCopy: (originalName: string | null): string => {
    const baseName = originalName ?? "Vorlage";
    const truncated =
      baseName.length > 20 ? baseName.substring(0, 20) : baseName;
    return `${truncated}-${generateShortId()}`;
  },

  partner: (originalName: string | null): string => {
    const baseName = originalName ?? "Partner";
    const truncated =
      baseName.length > 20 ? baseName.substring(0, 20) : baseName;
    return `P-${truncated}-${generateShortId()}`;
  },

  file: (extension = "pdf"): string =>
    `DATEI-${generateShortId()}.${extension}`,
};
