import { expect, test } from "bun:test";
import { plannerDisplayName } from "./planner-name";

test("templates inherit custom planner names without changing the cover title", () => {
  expect(
    plannerDisplayName({ name: " Planer - Pro ", bookTitle: "Umschlag" }),
  ).toBe("Planer - Pro");
});
test("legacy generated names fall back to the original title", () => {
  expect(
    plannerDisplayName({ name: "BUCH-xb7vhk", bookTitle: "Planer - Pro" }),
  ).toBe("Planer - Pro");
  expect(
    plannerDisplayName({
      name: "BUCH-xb7vhk-k34r6p",
      bookTitle: "Planer - Pro",
    }),
  ).toBe("Planer - Pro");
  expect(plannerDisplayName({ name: "", bookTitle: " Original " })).toBe(
    "Original",
  );
  expect(plannerDisplayName({ name: "BUCH-xb7vhk" })).toBe("BUCH-xb7vhk");
  expect(plannerDisplayName({})).toBe("Schulplaner");
});
