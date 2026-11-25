import { expect, test } from "bun:test";
import { combinePlannerDateEntries } from "./planner-date-merge";
import plannerHandler from "./planner.handler";
import type { TagContext } from "../types";

test("holiday, vacation marker and custom event remain visible on the same day", () => {
  const result = combinePlannerDateEntries([
    { date: "2026-12-25", name: "1. Weihnachtstag" },
    { date: "2026-12-25", name: "Weihnachtsferien Start" },
    { date: "2026-12-25T09:00:00Z", name: "Schulveranstaltung" },
    { date: "2026-12-25", name: "1. Weihnachtstag" },
    { date: "2026-02-30", name: "Invalid" },
  ]);
  expect(result.get("2026-12-25")).toBe("1. Weihnachtstag · Weihnachtsferien Start · Schulveranstaltung");
  expect(result.size).toBe(1);
});

test("weekend holidays go into the week's notes instead of disappearing", () => {
  const tag = plannerHandler.tags.find(tag => tag.fieldName === "WEEKEND_DATES")!;
  const context = {
    weekDates: [new Date(2026, 8, 28)],
    holidayMap: new Map([["2026-10-03", "Tag der Deutschen Einheit"], ["2026-10-04", "Schulfest"]]),
  } as TagContext;
  expect(tag.getValue(context)).toBe("Sa 03.10: Tag der Deutschen Einheit · So 04.10: Schulfest");
  expect(tag.getValue({ ...context, holidayMap: new Map() })).toBe("");
});
