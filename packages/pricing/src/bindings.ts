// Binding catalog shared by the shop (matching, page limits) and the panel
// (price labels). Prices live in the price book, keyed by `key`.
export const BINDINGS = [
  {
    key: "klammerheftung",
    label: "Klammerheftbindung",
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
  },
  {
    key: "kunststoffspirale",
    label: "Kunststoffspirale",
    matchers: ["kunststoffspirale", "plast-o-bind"],
  },
  {
    key: "hot-melt",
    label: "Hot-Melt-Bindung",
    matchers: ["hot-melt-bindung", "hotmeltbindung", "leimbindung"],
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  matchers: readonly string[];
  maxPages?: number;
}>;

export type Binding = (typeof BINDINGS)[number];
export type BindingKey = Binding["key"];

export const BINDING_KEYS = BINDINGS.map((binding) => binding.key) as [
  BindingKey,
  ...BindingKey[],
];

function normalizeBindingName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function findBindingByName(bindingName: string): Binding | null {
  const normalized = normalizeBindingName(bindingName);
  if (!normalized) return null;

  return (
    BINDINGS.find((binding) =>
      binding.matchers.some((matcher) =>
        normalized.includes(normalizeBindingName(matcher)),
      ),
    ) ?? null
  );
}
