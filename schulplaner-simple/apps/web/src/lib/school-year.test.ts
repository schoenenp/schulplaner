import { describe, expect, test } from "bun:test";
import { defaultPeriod } from "./school-year";

const none = { defaultPlanStart: null, defaultPlanEnd: null };

describe("default school year", () => {
  test("proposes the coming school year in spring", () => {
    const { start, end } = defaultPeriod(none, new Date("2027-03-10T10:00:00Z"));
    expect(start.toISOString().slice(0, 10)).toBe("2027-08-01");
    expect(end.toISOString().slice(0, 10)).toBe("2028-07-31");
  });

  test("keeps the current year shortly after it started, then moves on", () => {
    expect(defaultPeriod(none, new Date("2027-08-20T10:00:00Z")).start.getUTCFullYear()).toBe(2027);
    expect(defaultPeriod(none, new Date("2027-10-31T10:00:00Z")).start.getUTCFullYear()).toBe(2028);
  });

  test("uses the configured day and month", () => {
    const { start, end } = defaultPeriod(
      { defaultPlanStart: new Date("2020-09-01T12:00:00Z"), defaultPlanEnd: new Date("2020-07-10T12:00:00Z") },
      new Date("2027-03-10T10:00:00Z"),
    );
    expect(start.toISOString().slice(0, 10)).toBe("2027-09-01");
    expect(end.toISOString().slice(0, 10)).toBe("2028-07-10");
  });
});
