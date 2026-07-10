import { COUNTRIES, getRegionsByCountry } from "@/util/book/regions";

const DEFAULT_COUNTRY = "DE";
const DEFAULT_REGION_BY_COUNTRY: Record<string, string> = {
  DE: "DE-SL",
  AT: "AT-9",
};

const AUSTRIA_REGION_ALIASES: Record<string, string> = {
  B: "AT-1",
  BURGENLAND: "AT-1",
  K: "AT-2",
  KAERNTEN: "AT-2",
  KARNTEN: "AT-2",
  N: "AT-3",
  NOE: "AT-3",
  NIEDEROESTERREICH: "AT-3",
  NIEDEROSTERREICH: "AT-3",
  O: "AT-4",
  OOE: "AT-4",
  OBEROESTERREICH: "AT-4",
  OBEROSTERREICH: "AT-4",
  S: "AT-5",
  SALZBURG: "AT-5",
  ST: "AT-6",
  STEIERMARK: "AT-6",
  T: "AT-7",
  TIROL: "AT-7",
  V: "AT-8",
  VORARLBERG: "AT-8",
  W: "AT-9",
  WIEN: "AT-9",
  VIENNA: "AT-9",
};
const LANGUAGE_COUNTRY_REGEX = /(?:-|_)([A-Za-z]{2})$/;

function normalizeToken(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
}

function isSupportedCountry(country: string): boolean {
  return COUNTRIES.some((entry) => entry.code === country);
}

function resolveCountryCode(input: string | null | undefined): string | null {
  const normalized = normalizeToken(input);
  if (normalized.length !== 2) return null;
  return isSupportedCountry(normalized) ? normalized : null;
}

function parseCountryFromAcceptLanguage(
  acceptLanguage: string | null,
): string | null {
  if (!acceptLanguage) return null;

  const languageRanges = acceptLanguage.split(",");
  for (const range of languageRanges) {
    const languageTag = range.split(";")[0]?.trim() ?? "";
    const match = LANGUAGE_COUNTRY_REGEX.exec(languageTag);
    const country = resolveCountryCode(match?.[1] ?? null);
    if (country) return country;
  }

  return null;
}

export function getDefaultRegionForCountry(country: string): string {
  const regions = getRegionsByCountry(country);
  const preferred = DEFAULT_REGION_BY_COUNTRY[country];

  if (preferred && regions.some((region) => region.code === preferred)) {
    return preferred;
  }
  if (regions.length > 0) {
    return regions[0]!.code;
  }

  const fallbackRegions = getRegionsByCountry(DEFAULT_COUNTRY);
  const fallbackPreferred = DEFAULT_REGION_BY_COUNTRY[DEFAULT_COUNTRY];

  if (
    fallbackPreferred &&
    fallbackRegions.some((region) => region.code === fallbackPreferred)
  ) {
    return fallbackPreferred;
  }
  return fallbackRegions[0]?.code ?? "";
}

function resolveRegionForCountry(
  country: string,
  input: string | null | undefined,
): string {
  const normalizedRegion = normalizeToken(input);
  const regionSet = new Set(
    getRegionsByCountry(country).map((region) => region.code),
  );
  const hasRegion = (code: string) => regionSet.has(code);

  if (!normalizedRegion) {
    return getDefaultRegionForCountry(country);
  }

  if (country === "DE") {
    if (hasRegion(normalizedRegion)) return normalizedRegion;

    const compactRegion = normalizedRegion.replace(/^DE-/, "");
    if (compactRegion.length === 2) {
      const mapped = `DE-${compactRegion}`;
      if (hasRegion(mapped)) return mapped;
    }

    return getDefaultRegionForCountry(country);
  }

  if (country === "AT") {
    if (hasRegion(normalizedRegion)) return normalizedRegion;

    const compactRegion = normalizedRegion.replace(/^AT-/, "");
    if (/^[1-9]$/.test(compactRegion)) {
      const mapped = `AT-${compactRegion}`;
      if (hasRegion(mapped)) return mapped;
    }

    const aliasMapped = AUSTRIA_REGION_ALIASES[compactRegion];
    if (aliasMapped && hasRegion(aliasMapped)) {
      return aliasMapped;
    }

    return getDefaultRegionForCountry(country);
  }

  if (hasRegion(normalizedRegion)) {
    return normalizedRegion;
  }

  const prefixedRegion = `${country}-${normalizedRegion}`;
  if (hasRegion(prefixedRegion)) {
    return prefixedRegion;
  }

  return getDefaultRegionForCountry(country);
}

export function sanitizeCountryRegionPrefill(
  countryInput: string | null | undefined,
  regionInput: string | null | undefined,
): {
  country: string;
  region: string;
} {
  const country = resolveCountryCode(countryInput) ?? DEFAULT_COUNTRY;
  const region = resolveRegionForCountry(country, regionInput);
  return { country, region };
}

export function detectCountryRegionFromHeaders(requestHeaders: Headers): {
  country: string;
  region: string;
} {
  const headerCountry =
    resolveCountryCode(requestHeaders.get("x-vercel-ip-country")) ??
    resolveCountryCode(requestHeaders.get("cf-ipcountry")) ??
    resolveCountryCode(requestHeaders.get("cloudfront-viewer-country")) ??
    resolveCountryCode(requestHeaders.get("x-country-code"));

  const acceptLanguageCountry = parseCountryFromAcceptLanguage(
    requestHeaders.get("accept-language"),
  );
  const country = headerCountry ?? acceptLanguageCountry ?? DEFAULT_COUNTRY;

  const regionHeader =
    requestHeaders.get("x-vercel-ip-country-region") ??
    requestHeaders.get("cloudfront-viewer-country-region") ??
    requestHeaders.get("x-vercel-ip-region");

  return sanitizeCountryRegionPrefill(country, regionHeader);
}
