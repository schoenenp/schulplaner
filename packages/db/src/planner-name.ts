/** Resolve a saved planner name, falling back to its cover title for generated names. */
export function plannerDisplayName(book: {
  name?: string | null;
  bookTitle?: string | null;
}): string {
  const name = book.name?.trim();
  const title = book.bookTitle?.trim();
  const generated = name && /^BUCH-[a-z0-9]{6}(?:-[a-z0-9]{6})*$/i.test(name);
  return (!generated && name) || title || name || "Schulplaner";
}
