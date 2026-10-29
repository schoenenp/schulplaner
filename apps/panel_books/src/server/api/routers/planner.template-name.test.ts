/* eslint-disable @typescript-eslint/await-thenable -- Bun rejection matchers are asynchronous. */
import { expect, test, mock } from "bun:test";
import { createCallerFactory } from "../trpc";
import { plannerRouter } from "./planner";

function fixture(
  role: string | null = "STAFF",
  isTemplate = true,
  deletedAt: Date | null = null,
) {
  const record = {
    id: "template",
    name: "BUCH-xb7vhk",
    bookTitle: "Gedruckter Titel",
    isTemplate,
    deletedAt,
  };
  const update = mock(async ({ data }: { data: object }) => ({
    ...record,
    ...data,
  }));
  const api = createCallerFactory(plannerRouter)({
    session: role
      ? ({ user: { id: "staff", role }, expires: "2099-01-01" } as never)
      : null,
    headers: new Headers(),
    db: {
      book: {
        findFirst: async ({
          where,
        }: {
          where: { id: string; isTemplate: boolean; deletedAt: null };
        }) =>
          where.id === record.id &&
          where.isTemplate === record.isTemplate &&
          where.deletedAt === record.deletedAt
            ? record
            : null,
        update,
      },
    } as never,
  });
  return { api, record, update };
}

test("staff can rename a template without changing printed text", async () => {
  const f = fixture();
  const result = await f.api.renameTemplate({
    bookId: "template",
    name: "  Planer - Pro  ",
  });
  expect(f.update).toHaveBeenCalledWith({
    where: { id: "template" },
    data: { name: "Planer - Pro" },
  });
  expect(result.bookTitle).toBe("Gedruckter Titel");
});

test.each(["", "   ", "x".repeat(141)])(
  "rejects invalid template name: %j",
  async (name) => {
    const f = fixture();
    await expect(
      f.api.renameTemplate({ bookId: "template", name }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(f.update).not.toHaveBeenCalled();
  },
);

test("cannot rename missing, deleted or ordinary planner records", async () => {
  for (const [f, bookId] of [
    [fixture(), "missing"],
    [fixture("STAFF", false), "template"],
    [fixture("STAFF", true, new Date()), "template"],
  ] as const) {
    await expect(
      f.api.renameTemplate({ bookId, name: "Planer - Pro" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(f.update).not.toHaveBeenCalled();
  }
});

test.each([null, "USER", "PARTNER"])(
  "denies template rename for role %j",
  async (role) => {
    const f = fixture(role);
    await expect(
      f.api.renameTemplate({ bookId: "template", name: "Planer - Pro" }),
    ).rejects.toThrow();
    expect(f.update).not.toHaveBeenCalled();
  },
);
