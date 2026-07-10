export type BindingRule = {
  matchers: string[];
  maxPages?: number;
  price?: {
    fixed?: number;
    min?: number;
    max?: number;
  };
  label: string;
};

export const BINDING_RULES: BindingRule[] = [
  {
    matchers: [
      "klammerheftung",
      "klammerheftbindung",
      "ruckenheftklammer",
      "rueckenheftklammer",
      "ruckenheft",
      "rueckenheft",
      "klammerheft",
      "heftklammer",
    ],
    maxPages: 100,
    // Example: use fixed binding price in cents.
    price: { fixed: 25 },
    label: "Klammerheftbindung",
  },
  {
    matchers: ["kunststoffspirale", "plast-o-bind"],
    price: { fixed: 50 },
    label: "Kunststoffspirale",
  },
  {
    matchers: ["hot-melt-bindung", "hotmeltbindung", "leimbindung"],
    price: { fixed: 60 },
    label: "Hot-Melt-Bindung",
  },
];

function normalizeBindingName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function getBindingPageLimitByName(bindingName: string): number | null {
  const matchedRule = getBindingRule(bindingName);
  if (!matchedRule || typeof matchedRule.maxPages !== "number") return null;
  return matchedRule.maxPages;
}

function getBindingRule(bindingName: string): BindingRule | null {
  const normalized = normalizeBindingName(bindingName);
  if (!normalized) return null;

  return (
    BINDING_RULES.find((rule) =>
      rule.matchers.some((matcher) =>
        normalized.includes(normalizeBindingName(matcher)),
      ),
    ) ?? null
  );
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
  const matchedRule = getBindingRule(bindingName);
  if (!matchedRule) return null;
  if (typeof matchedRule.maxPages !== "number") return null;

  return `bis ${matchedRule.maxPages} Seiten.`;
}

export function getBindingPriceOverrideByName(bindingName: string): {
  fixed?: number;
  min?: number;
  max?: number;
} | null {
  const matchedRule = getBindingRule(bindingName);
  if (!matchedRule?.price) return null;
  return matchedRule.price;
}
