/** Proposed school year for a new planner: next 1 Aug – 31 Jul by default. */
export function defaultPeriod(
  settings: { defaultPlanStart: Date | null; defaultPlanEnd: Date | null },
  today = new Date(),
) {
  const startMonth = settings.defaultPlanStart?.getUTCMonth() ?? 7;
  const startDay = settings.defaultPlanStart?.getUTCDate() ?? 1;
  const endMonth = settings.defaultPlanEnd?.getUTCMonth() ?? 6;
  const endDay = settings.defaultPlanEnd?.getUTCDate() ?? 31;
  // Once a school year has started, propose the next one.
  let year = today.getUTCFullYear();
  if (Date.UTC(year, startMonth, startDay) < today.getTime() - 30 * 86400000) {
    year += 1;
  }
  const start = new Date(Date.UTC(year, startMonth, startDay, 12));
  const endYear = Date.UTC(year, endMonth, endDay) <= start.getTime() ? year + 1 : year;
  const end = new Date(Date.UTC(endYear, endMonth, endDay, 12));
  return { start, end };
}
