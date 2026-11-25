import { describe, expect, test } from "bun:test";
import { CustomDateSchema, PlannerInfoSchema, customDateProblem } from "./planner-input";
import { parseDateInput } from "./format";

const period = { planStart: parseDateInput("2027-08-02")!, planEnd: parseDateInput("2028-07-30")! };

describe("custom planner dates", () => {
  test("accepts a weekday inside the period", () => {
    expect(customDateProblem(parseDateInput("2027-09-15")!, period, [])).toBeNull();
  });

  test("rejects weekends, which the week spread has no field for", () => {
    expect(customDateProblem(parseDateInput("2027-09-18")!, period, [])).toContain("Wochenenden");
  });

  test("rejects dates outside the planner period", () => {
    expect(customDateProblem(parseDateInput("2027-07-30")!, period, [])).toContain("außerhalb");
    expect(customDateProblem(parseDateInput("2028-08-01")!, period, [])).toContain("außerhalb");
  });

  test("allows one entry per day", () => {
    const existing = [parseDateInput("2027-09-15")!];
    expect(customDateProblem(parseDateInput("2027-09-15")!, period, existing)).toContain("schon einen Termin");
  });

  test("limits labels to one printable line", () => {
    expect(CustomDateSchema.safeParse({ date: "2027-09-15", name: "x".repeat(41) }).success).toBe(false);
    expect(CustomDateSchema.parse({ date: "2027-09-15", name: " Elternabend " }).name).toBe("Elternabend");
  });
});

describe("planner info", () => {
  const valid = {
    bookTitle: "Mein Schuljahr",
    subTitle: "",
    region: "DE-BY",
    planStart: "2027-08-02",
    planEnd: "2028-07-30",
  };

  test("derives the country from the region and stores dates at noon UTC", () => {
    const parsed = PlannerInfoSchema.parse(valid);
    expect(parsed.country).toBe("DE");
    expect(parsed.subTitle).toBeNull();
    expect(parsed.planStart.toISOString()).toBe("2027-08-02T12:00:00.000Z");
  });

  test("rejects unknown regions and implausible periods", () => {
    expect(PlannerInfoSchema.safeParse({ ...valid, region: "DE-XX" }).success).toBe(false);
    expect(PlannerInfoSchema.safeParse({ ...valid, region: "AT-9" }).success).toBe(true);
    expect(PlannerInfoSchema.safeParse({ ...valid, planEnd: "2027-08-10" }).success).toBe(false);
    expect(PlannerInfoSchema.safeParse({ ...valid, planEnd: "2029-01-01" }).success).toBe(false);
  });
});
