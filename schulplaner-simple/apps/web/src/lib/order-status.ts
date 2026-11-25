import type { OrderStatus } from "db";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  NEW: "Neu",
  IN_PRODUCTION: "In Produktion",
  SHIPPED: "Versendet",
  COMPLETED: "Abgeschlossen",
  CANCELED: "Storniert",
};

/** What the school sees for each status. */
export const ORDER_STATUS_SCHOOL_TEXT: Record<OrderStatus, string> = {
  NEW: "Ihre Bestellung ist eingegangen und wird für den Druck vorbereitet.",
  IN_PRODUCTION: "Ihre Planer werden gedruckt.",
  SHIPPED: "Ihre Planer sind unterwegs.",
  COMPLETED: "Die Bestellung ist abgeschlossen.",
  CANCELED: "Die Bestellung wurde storniert.",
};

export const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  NEW: "bg-amber-100 text-amber-900",
  IN_PRODUCTION: "bg-sky-100 text-sky-900",
  SHIPPED: "bg-indigo-100 text-indigo-900",
  COMPLETED: "bg-emerald-100 text-emerald-900",
  CANCELED: "bg-gray-200 text-gray-700",
};

/** The one forward step from each status; canceling is separate. */
export const NEXT_ORDER_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  NEW: "IN_PRODUCTION",
  IN_PRODUCTION: "SHIPPED",
  SHIPPED: "COMPLETED",
};

export const NEXT_STEP_LABEL: Partial<Record<OrderStatus, string>> = {
  NEW: "In Produktion geben",
  IN_PRODUCTION: "Als versendet markieren",
  SHIPPED: "Abschließen",
};

export function canCancel(status: OrderStatus) {
  return status === "NEW" || status === "IN_PRODUCTION";
}

export const ORDER_STATUS_ORDER: OrderStatus[] = [
  "NEW",
  "IN_PRODUCTION",
  "SHIPPED",
  "COMPLETED",
];
