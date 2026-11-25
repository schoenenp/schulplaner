const euroFormat = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});

export function euro(cents: number) {
  return euroFormat.format(cents / 100);
}

/** Display a calendar date. Planner dates are stored at 12:00 UTC. */
export function germanDate(date: Date | string | null | undefined) {
  if (!date) return "–";
  return new Date(date).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function germanDateTime(date: Date | string | null | undefined) {
  if (!date) return "–";
  return new Date(date).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });
}

/** YYYY-MM-DD for <input type="date">. */
export function dateInputValue(date: Date | string | null | undefined) {
  if (!date) return "";
  return new Date(date).toISOString().slice(0, 10);
}

/**
 * Parse <input type="date"> values as noon UTC so the calendar day survives
 * every server and browser time zone.
 */
export function parseDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function orderNumber(id: number) {
  return `B-${String(id).padStart(5, "0")}`;
}
