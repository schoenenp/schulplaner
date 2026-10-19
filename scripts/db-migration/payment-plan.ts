export type PendingPayment = {
  bookOrderId: string | null;
  paymentId: string;
  shopId: string | null;
  paymentStatus: string;
  currency: string;
  total: string;
  orderKey: string | null;
};
export type Checkout = {
  id: string;
  status: string | null;
  payment_status: string;
  currency: string | null;
  amount_total: number | null;
  metadata: Record<string, string> | null;
};

/** Read-only decisions; replay uses the application's existing order.validate flow. */
export function paymentPlan(rows: PendingPayment[], sessions: Checkout[]) {
  const byBookOrder = new Map<string, Checkout[]>();
  for (const session of sessions) {
    const id = session.metadata?.orderId;
    if (id) byBookOrder.set(id, [...(byBookOrder.get(id) ?? []), session]);
  }
  return rows.map(row => {
    const candidates = row.bookOrderId ? byBookOrder.get(row.bookOrderId) ?? [] : [];
    const exact = row.shopId ? sessions.find(s => s.id === row.shopId) : undefined;
    const session = exact ?? (candidates.length === 1 ? candidates[0] : undefined);
    const base = { bookOrderId: row.bookOrderId, paymentId: row.paymentId, recordedSessionId: row.shopId, sessionId: session?.id ?? null };
    if (!row.bookOrderId) return { ...base, action: "manual_review", reason: "missing_book_order" };
    if (!session) return { ...base, action: "manual_review", reason: candidates.length > 1 ? "multiple_checkout_sessions" : "missing_checkout_session" };
    if (session.metadata?.orderId !== row.bookOrderId || (row.shopId && row.shopId !== session.id)) return { ...base, action: "manual_review", reason: "session_reference_mismatch" };
    if (session.currency?.toUpperCase() !== row.currency.toUpperCase()) return { ...base, action: "manual_review", reason: "currency_mismatch" };
    if (session.status === "complete" && ["paid", "no_payment_required"].includes(session.payment_status)) {
      if (!["PENDING", "SUCCEEDED"].includes(row.paymentStatus)) return { ...base, action: "manual_review", reason: "terminal_database_payment_status" };
      if (!Number.isSafeInteger(session.amount_total) || session.amount_total! < 0 || session.amount_total! > 2147483647) return { ...base, action: "manual_review", reason: "amount_out_of_range" };
      if (row.paymentStatus === "SUCCEEDED" && BigInt(row.total) !== BigInt(session.amount_total!)) return { ...base, action: "manual_review", reason: "settled_amount_mismatch" };
      return { ...base, action: row.orderKey && row.paymentStatus === "SUCCEEDED" ? "already_reconciled" : "replay_order_validation", amountTotal: session.amount_total };
    }
    return { ...base, action: session.status === "expired" ? "expired_checkout" : "await_payment", paymentStatus: session.payment_status };
  });
}
