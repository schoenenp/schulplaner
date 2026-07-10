import { normalizeDate } from "../helpers";

export type PlannerDateEntry = {
  date: string;
  name: string;
};

export function normalizePlannerDateKey(date: string): string | null {
  const normalized = normalizeDate(date).trim();
  if (!normalized) return null;

  // Enforce strict YYYY-MM-DD so all sources follow the same format path.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const [yearStr, monthStr, dayStr] = normalized.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return normalized;
}

export function mergePlannerDateEntries(
  holidays: PlannerDateEntry[],
  customDates: PlannerDateEntry[] = [],
): Map<string, string> {
  const mergedMap = new Map<string, string>();

  for (const holiday of holidays) {
    const normalizedDate = normalizePlannerDateKey(holiday.date);
    if (!normalizedDate) continue;
    mergedMap.set(normalizedDate, holiday.name);
  }

  // Custom dates are applied last so they override holidays on date collisions.
  for (const customDate of customDates) {
    const normalizedDate = normalizePlannerDateKey(customDate.date);
    if (!normalizedDate) continue;
    mergedMap.set(normalizedDate, customDate.name);
  }

  return mergedMap;
}
