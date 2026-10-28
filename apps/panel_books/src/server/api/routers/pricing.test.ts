import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DEFAULT_PRICE_BOOK } from "pricing";
import {
  PriceBookConflictError,
  PriceBookUnchangedError,
  type PriceBookVersion,
} from "pricing/store";

const current: PriceBookVersion = {
  id: 1,
  priceBook: DEFAULT_PRICE_BOOK,
  note: null,
  createdAt: "2026-10-28T12:00:00.000Z",
  createdById: null,
  createdByName: null,
  restoredFromId: null,
};
const overview = mock(async () => ({
  current,
  history: [current],
  createdAt: current.createdAt,
}));
const save = mock(async (_input: unknown) => ({ ...current, id: 2 }));
const restore = mock(async (_input: unknown) => ({
  ...current,
  id: 3,
  restoredFromId: 1,
}));
const getStore = mock(async () => ({ overview, save, restore }));
mock.module("@/server/pricing", () => ({ getPriceStore: getStore }));
const { createCallerFactory } = await import("../trpc");
const { pricingRouter } = await import("./pricing");

function callerFor(role: string | null) {
  return createCallerFactory(pricingRouter)({
    db: {} as never,
    session: role
      ? ({
          user: { id: `user_${role}`, role, name: `${role} Name` },
          expires: "2099-01-01",
        } as never)
      : null,
    headers: new Headers(),
  });
}
const raisedColor = {
  ...DEFAULT_PRICE_BOOK,
  sheets: {
    ...DEFAULT_PRICE_BOOK.sheets,
    color: { singleCents: 16, bulkCents: 9 },
  },
};

beforeEach(() => {
  getStore.mockClear();
  overview.mockClear();
  save.mockReset().mockImplementation(async () => ({ ...current, id: 2 }));
  restore
    .mockReset()
    .mockImplementation(async () => ({ ...current, id: 3, restoredFromId: 1 }));
});

describe("pricing router", () => {
  test("rejects every non-admin before accessing the pricing database", async () => {
    for (const role of ["STAFF", "MODERATOR", "PARTNER"]) {
      const caller = callerFor(role);
      await expect(caller.get()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.save({ baseVersionId: 1, priceBook: raisedColor }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller.restore({ versionId: 1, baseVersionId: 1 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(callerFor(null).get()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(getStore).not.toHaveBeenCalled();
  });
  test("returns an awaited consistent overview", async () => {
    expect(await callerFor("ADMIN").get()).toEqual({
      current,
      history: [current],
      createdAt: current.createdAt,
    });
    expect(overview).toHaveBeenCalledWith(30);
  });
  test("saves and restores with the authenticated admin as author", async () => {
    const caller = callerFor("ADMIN");
    expect(
      (
        await caller.save({
          baseVersionId: 1,
          note: "Farbe teurer",
          priceBook: raisedColor,
        })
      ).id,
    ).toBe(2);
    expect(save).toHaveBeenCalledWith({
      baseVersionId: 1,
      note: "Farbe teurer",
      priceBook: raisedColor,
      actor: { id: "user_ADMIN", name: "ADMIN Name" },
    });
    expect(
      (await caller.restore({ versionId: 1, baseVersionId: 2 })).restoredFromId,
    ).toBe(1);
    expect(restore).toHaveBeenCalledWith({
      versionId: 1,
      baseVersionId: 2,
      actor: { id: "user_ADMIN", name: "ADMIN Name" },
    });
  });
  test("maps asynchronous store errors to API errors", async () => {
    const caller = callerFor("ADMIN");
    save.mockRejectedValueOnce(new PriceBookConflictError(2));
    await expect(
      caller.save({ baseVersionId: 1, priceBook: raisedColor }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    save.mockRejectedValueOnce(new PriceBookUnchangedError());
    await expect(
      caller.save({ baseVersionId: 2, priceBook: raisedColor }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    restore.mockRejectedValueOnce(new PriceBookConflictError(3));
    await expect(
      caller.restore({ versionId: 1, baseVersionId: 2 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  test("rejects invalid prices before writing", async () => {
    await expect(
      callerFor("ADMIN").save({
        baseVersionId: 1,
        priceBook: { ...raisedColor, minimumUnitCents: -5 },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(save).not.toHaveBeenCalled();
  });
});
