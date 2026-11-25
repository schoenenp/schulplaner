import { z } from "zod";
import { parseDateInput } from "@/lib/format";
import { isKnownRegion } from "@/lib/regions";

const MAX_PERIOD_DAYS = 400;
const DAY_MS = 86_400_000;

const dateInput = z
  .string()
  .transform((value, ctx) => {
    const date = parseDateInput(value);
    if (!date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Bitte ein Datum wählen." });
      return z.NEVER;
    }
    return date;
  });

export const PlannerInfoSchema = z
  .object({
    bookTitle: z.string().trim().min(1, "Bitte einen Titel eingeben.").max(60, "Höchstens 60 Zeichen."),
    subTitle: z
      .string()
      .trim()
      .max(80, "Höchstens 80 Zeichen.")
      .transform((value) => value || null),
    region: z.string().regex(/^(DE|AT)-[A-Z0-9]{1,2}$/, "Bitte ein Bundesland wählen."),
    planStart: dateInput,
    planEnd: dateInput,
  })
  .transform((value) => ({
    ...value,
    country: value.region.slice(0, 2) as "DE" | "AT",
  }))
  .superRefine((value, ctx) => {
    if (!isKnownRegion(value.country, value.region)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["region"], message: "Unbekanntes Bundesland." });
    }
    const days = (value.planEnd.getTime() - value.planStart.getTime()) / DAY_MS;
    if (days < 28) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["planEnd"], message: "Das Ende muss mindestens 4 Wochen nach dem Start liegen." });
    } else if (days > MAX_PERIOD_DAYS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["planEnd"], message: "Der Zeitraum darf höchstens 13 Monate umfassen." });
    }
  });

export const CustomDateSchema = z.object({
  date: dateInput,
  // The week template prints one single-line label per day.
  name: z.string().trim().min(1, "Bitte eine Bezeichnung eingeben.").max(40, "Höchstens 40 Zeichen."),
});

/**
 * The week spread has fields for Monday to Friday only (xA–xE) and one label
 * per day, so weekend dates and a second entry on the same day would never be
 * printed. Returns a message for the school, or null when the date fits.
 */
export function customDateProblem(
  date: Date,
  period: { planStart: Date; planEnd: Date | null },
  existing: Date[],
): string | null {
  const day = date.getUTCDay();
  if (day === 0 || day === 6) {
    return "Wochenenden haben im Planer kein Feld. Bitte einen Tag von Montag bis Freitag wählen.";
  }
  const key = date.toISOString().slice(0, 10);
  const start = period.planStart.toISOString().slice(0, 10);
  const end = period.planEnd?.toISOString().slice(0, 10);
  if (key < start || (end && key > end)) {
    return "Der Termin liegt außerhalb des Planer-Zeitraums.";
  }
  if (existing.some((other) => other.toISOString().slice(0, 10) === key)) {
    return "An diesem Tag gibt es schon einen Termin. Pro Tag wird ein Eintrag gedruckt.";
  }
  return null;
}

export function firstIssue(error: z.ZodError, labels: Record<string, string> = {}) {
  const issue = error.issues[0];
  if (!issue) return "Bitte prüfen Sie Ihre Eingaben.";
  const label = labels[issue.path.join(".")];
  return label ? `${label}: ${issue.message}` : issue.message;
}
