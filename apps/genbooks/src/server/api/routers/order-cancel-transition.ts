import type { OrderStatus } from "@prisma/client";

export function getCancellationGuardError(params: {
  orderStatus: OrderStatus;
  hasPayment: boolean;
}): string | null {
  const { orderStatus, hasPayment } = params;
  if (orderStatus === "CANCELED") {
    return "Order is already canceled";
  }
  if (orderStatus !== "PENDING") {
    return "Only pending orders can be canceled";
  }
  if (!hasPayment) {
    return "Order payment not found";
  }
  return null;
}

export function getCancellationPaymentStatus(params: {
  hasPaymentIntent: boolean;
}): "REFUNDED" | "CANCELLED" {
  return params.hasPaymentIntent ? "REFUNDED" : "CANCELLED";
}

