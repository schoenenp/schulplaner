import { describe, expect, it, mock } from "bun:test";
import { createCallerFactory, type createTRPCContext } from "@/server/api/trpc";
import { configRouter } from "./config";

const createCaller = createCallerFactory(configRouter);
const details = {
  bookId: "draft",
  isPickup: false,
  quantity: 30,
  saveUser: false,
};
const orderAddress = {
  prename: "Max",
  name: "Mustermann",
  street: "Hauptstraße",
  streetNr: "1",
  city: "Wien",
  zip: "1010",
  email: "schule@example.test",
};

function callerFor(book: object) {
  const findFirst = mock(async () => book);
  const checkout = createCaller({
    headers: new Headers({ "x-forwarded-for": "198.51.100.42" }),
    db: { book: { findFirst } },
    session: null,
  } as unknown as Awaited<ReturnType<typeof createTRPCContext>>);
  return { checkout, findFirst };
}

describe("legacy configurator checkout", () => {
  it("rejects partner checkout tokens before opening an order", async () => {
    const { checkout, findFirst } = callerFor({ sourceType: "STANDARD" });
    await expect(
      checkout.setupOrder({
        details: { ...details, partnerToken: "old-token" },
        orderAddress,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it.each([
    { sourceType: "PARTNER_TEMPLATE" },
    { sourceType: "STANDARD", clientRef: "pirrot-school-order" },
  ])(
    "rejects drafts and snapshots outside the legacy checkout: %j",
    async (book) => {
      const { checkout } = callerFor(book);
      await expect(
        checkout.setupOrder({ details, orderAddress }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    },
  );
});
