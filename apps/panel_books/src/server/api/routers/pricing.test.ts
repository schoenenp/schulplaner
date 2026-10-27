import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DEFAULT_PRICE_BOOK } from "pricing";
import { createPriceStore, openSqliteDatabase, type PriceStore } from "pricing/store";

let store: PriceStore;
mock.module("@/server/pricing", () => ({ getPriceStore: () => store }));

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
  store = createPriceStore(openSqliteDatabase(":memory:"));
});

describe("pricing router", () => {
  test("only admins can read or change prices", async () => {
    for (const role of ["STAFF", "MODERATOR"]) {
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
    expect(store.history()).toHaveLength(1);
  });

  test("admins save new versions with their name and note", async () => {
    const caller = callerFor("ADMIN");
    expect((await caller.get()).current.priceBook).toEqual(DEFAULT_PRICE_BOOK);

    const saved = await caller.save({
      baseVersionId: 1,
      note: "Farbe teurer",
      priceBook: raisedColor,
    });
    expect(saved).toMatchObject({
      id: 2,
      note: "Farbe teurer",
      createdById: "user_ADMIN",
      createdByName: "ADMIN Name",
    });

    const overview = await caller.get();
    expect(overview.current.id).toBe(2);
    expect(overview.history.map((version) => version.id)).toEqual([2, 1]);
  });

  test("reports conflicts, unchanged saves and invalid prices", async () => {
    const caller = callerFor("ADMIN");
    await caller.save({ baseVersionId: 1, priceBook: raisedColor });

    await expect(
      caller.save({ baseVersionId: 1, priceBook: DEFAULT_PRICE_BOOK }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      caller.save({ baseVersionId: 2, priceBook: raisedColor }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.save({
        baseVersionId: 2,
        priceBook: { ...raisedColor, minimumUnitCents: -5 },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(store.current().id).toBe(2);
  });

  test("restores an earlier version", async () => {
    const caller = callerFor("ADMIN");
    await caller.save({ baseVersionId: 1, priceBook: raisedColor });
    const restored = await caller.restore({ versionId: 1, baseVersionId: 2 });
    expect(restored).toMatchObject({ id: 3, restoredFromId: 1 });
    expect(store.current().priceBook).toEqual(DEFAULT_PRICE_BOOK);
  });
});
