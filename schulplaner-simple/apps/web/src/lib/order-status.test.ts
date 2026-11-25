import { describe, expect, test } from "bun:test";
import { NEXT_ORDER_STATUS, canCancel } from "./order-status";

describe("order workflow", () => {
  test("runs straight from new to completed without review steps", () => {
    const steps = ["NEW"];
    let status = NEXT_ORDER_STATUS.NEW;
    while (status) {
      steps.push(status);
      status = NEXT_ORDER_STATUS[status];
    }
    expect(steps).toEqual(["NEW", "IN_PRODUCTION", "SHIPPED", "COMPLETED"]);
  });

  test("allows canceling only before shipping", () => {
    expect(canCancel("NEW")).toBe(true);
    expect(canCancel("IN_PRODUCTION")).toBe(true);
    expect(canCancel("SHIPPED")).toBe(false);
    expect(canCancel("CANCELED")).toBe(false);
  });
});
