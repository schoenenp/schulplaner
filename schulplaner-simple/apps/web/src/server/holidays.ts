import "server-only";
import type { DateItem, HolidayQuery } from "pdf-pipeline";
import { brand } from "@/brand";
import { logger } from "@/lib/logger";

type HolidayName = { language: string; text: string };
type Holiday = {
  id: string;
  startDate: string;
  endDate: string;
  name: HolidayName[];
};

export const HOLIDAY_FAILURE_MESSAGE =
  "Ferien und Feiertage konnten gerade nicht geladen werden. Bitte versuchen Sie es in ein paar Minuten erneut.";

/** The pipeline prefixes module errors, so match on the message body. */
export function isHolidayFailure(error: unknown) {
  return error instanceof Error && error.message.includes(HOLIDAY_FAILURE_MESSAGE);
}

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; items: Promise<DateItem[]> }>();

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchHolidayList(url: string): Promise<Holiday[]> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as Holiday[];
}

async function loadHolidays(query: HolidayQuery): Promise<DateItem[]> {
  const countryCode = query.country ?? brand.country;
  const subdivisionCode = query.code ?? brand.region;
  const params = new URLSearchParams({
    countryIsoCode: countryCode,
    validFrom: formatDate(query.start),
    validTo: formatDate(query.end),
    languageIsoCode: "DE",
    subdivisionCode,
  });

  try {
    const [publicHolidays, schoolHolidays] = await Promise.all([
      fetchHolidayList(`https://openholidaysapi.org/PublicHolidays?${params}`),
      fetchHolidayList(`https://openholidaysapi.org/SchoolHolidays?${params}`),
    ]);
    const items: DateItem[] = [];
    // Same entries genbooks prints: public holidays on their day, school
    // holidays as a "Start" and an "Ende" marker.
    for (const day of publicHolidays) {
      const name = day.name.find((n) => n.language === "DE")?.text ?? "Feiertag";
      items.push({ id: day.id, name, date: day.startDate });
    }
    for (const day of schoolHolidays) {
      const name =
        day.name.find((n) => n.language === "DE")?.text ?? "Schulferien";
      items.push({ id: day.id, name: `${name} Start`, date: day.startDate });
      items.push({ id: day.id, name: `${name} Ende`, date: day.endDate });
    }
    return items.sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    logger.warn("holiday_fetch_failed", { countryCode, subdivisionCode, error });
    // Unlike genbooks this fails loudly: a print file silently missing every
    // holiday is worse than a generation that has to be retried.
    throw new Error(HOLIDAY_FAILURE_MESSAGE, { cause: error });
  }
}

/** Holiday provider for pdf-pipeline; successful lookups are cached. */
export function getHolidays(query: HolidayQuery): Promise<DateItem[]> {
  const key = [
    query.country,
    query.code,
    formatDate(query.start),
    formatDate(query.end),
  ].join("|");
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.items;
  const items = loadHolidays(query);
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, items });
  items.catch(() => cache.delete(key));
  return items;
}
