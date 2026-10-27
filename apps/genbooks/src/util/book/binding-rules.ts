import { findBindingByName, type BindingKey } from "pricing";

// Binding names, matchers and page limits live in the shared pricing package;
// binding prices are part of the admin-managed price book.

export function getBindingPageLimitByName(bindingName: string): number | null {
  const binding = findBindingByName(bindingName);
  if (!binding || !("maxPages" in binding)) return null;
  return binding.maxPages;
}

export function isBindingAllowedForTotalPages(
  bindingName: string,
  totalPages: number,
): boolean {
  const maxPages = getBindingPageLimitByName(bindingName);
  if (maxPages === null) return true;
  return totalPages <= maxPages;
}

export function getBindingLimitMessage(
  bindingName: string,
  _totalPages: number,
): string | null {
  const maxPages = getBindingPageLimitByName(bindingName);
  if (maxPages === null) return null;

  return `bis ${maxPages} Seiten.`;
}

export function getBindingKeyByName(bindingName: string): BindingKey | null {
  return findBindingByName(bindingName)?.key ?? null;
}
