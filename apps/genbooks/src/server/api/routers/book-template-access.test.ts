import { describe, expect, it } from "bun:test";
import { canToggleTemplateByRole } from "./book-template-access";

describe("canToggleTemplateByRole", () => {
  it("allows partner and moderator", () => {
    expect(canToggleTemplateByRole("SPONSOR")).toBeTrue();
    expect(canToggleTemplateByRole("MODERATOR")).toBeTrue();
  });

  it("allows admin and staff", () => {
    expect(canToggleTemplateByRole("ADMIN")).toBeTrue();
    expect(canToggleTemplateByRole("STAFF")).toBeTrue();
  });

  it("denies regular user", () => {
    expect(canToggleTemplateByRole("USER")).toBeFalse();
  });
});
