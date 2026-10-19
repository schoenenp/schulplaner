import { expect, it } from "bun:test";
import { paymentPlan, type Checkout, type PendingPayment } from "./payment-plan";

const payment: PendingPayment = { bookOrderId: "bo", paymentId: "p", shopId: "cs", paymentStatus: "PENDING", currency: "EUR", total: "0", orderKey: null };
const session: Checkout = { id: "cs", status: "complete", payment_status: "paid", currency: "eur", amount_total: 900, metadata: { orderId: "bo" } };

it("plans replay for completed outstanding payments, including delayed payments with an order", () => {
  expect(paymentPlan([payment], [session])[0]!.action).toBe("replay_order_validation");
  expect(paymentPlan([{ ...payment, orderKey: "ORD-1" }], [session])[0]!.action).toBe("replay_order_validation");
  expect(paymentPlan([{ ...payment, orderKey: "ORD-1", paymentStatus: "SUCCEEDED", total: "900" }], [session])[0]!.action).toBe("already_reconciled");
});

it("finds a checkout whose ID was not saved and rejects ambiguous or mismatched references", () => {
  expect(paymentPlan([{ ...payment, shopId: null }], [session])[0]!.action).toBe("replay_order_validation");
  expect(paymentPlan([{ ...payment, shopId: null }], [session, { ...session, id: "cs2" }])[0]!.action).toBe("manual_review");
  expect(paymentPlan([payment], [{ ...session, metadata: { orderId: "different" } }])[0]!.action).toBe("manual_review");
});

it("does not replay unpaid, refunded, currency-mismatched or inconsistent settled payments", () => {
  expect(paymentPlan([payment], [{ ...session, payment_status: "unpaid" }])[0]!.action).toBe("await_payment");
  expect(paymentPlan([{ ...payment, paymentStatus: "REFUNDED" }], [session])[0]!.action).toBe("manual_review");
  expect(paymentPlan([payment], [{ ...session, currency: "usd" }])[0]!.action).toBe("manual_review");
  expect(paymentPlan([{ ...payment, paymentStatus: "SUCCEEDED", total: "899" }], [session])[0]!.action).toBe("manual_review");
  expect(paymentPlan([payment], [{ ...session, amount_total: 2147483648 }])[0]!.action).toBe("manual_review");
  expect(paymentPlan([{ ...payment, bookOrderId: null }], [session])[0]!.action).toBe("manual_review");
});
