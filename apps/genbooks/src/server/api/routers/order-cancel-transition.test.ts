import { describe, expect, it } from "bun:test";
import {
  getCancellationGuardError,
  getCancellationPaymentStatus,
} from "./order-cancel-transition";

describe("getCancellationGuardError", () => {
  it("rejects already canceled orders", () => {
    expect(
      getCancellationGuardError({
        orderStatus: "CANCELED",
        hasPayment: true,
      }),
    ).toBe("Order is already canceled");
  });

  it("rejects non-pending orders", () => {
    expect(
      getCancellationGuardError({
        orderStatus: "COMPLETED",
        hasPayment: true,
      }),
    ).toBe("Only pending orders can be canceled");
  });

  it("rejects missing payment relation", () => {
    expect(
      getCancellationGuardError({
        orderStatus: "PENDING",
        hasPayment: false,
      }),
    ).toBe("Order payment not found");
  });

  it("allows pending order with payment", () => {
    expect(
      getCancellationGuardError({
        orderStatus: "PENDING",
        hasPayment: true,
      }),
    ).toBeNull();
  });
});

describe("getCancellationPaymentStatus", () => {
  it("returns REFUNDED when a payment intent exists", () => {
    expect(
      getCancellationPaymentStatus({
        hasPaymentIntent: true,
      }),
    ).toBe("REFUNDED");
  });

  it("returns CANCELLED when no payment intent exists", () => {
    expect(
      getCancellationPaymentStatus({
        hasPaymentIntent: false,
      }),
    ).toBe("CANCELLED");
  });
});

