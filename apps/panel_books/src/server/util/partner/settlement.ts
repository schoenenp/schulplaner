import { TRPCError } from "@trpc/server";

export type SettlementCycleWindow = {
  cycleYear: number;
  cycleMonth: number;
  cycleStart: Date;
  cycleEnd: Date;
};

export function asJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function asNumberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function resolveSettlementCycleWindow(input?: {
  cycleYear?: number;
  cycleMonth?: number;
}): SettlementCycleWindow {
  const now = new Date();
  const cycleYear = input?.cycleYear ?? now.getUTCFullYear();
  const cycleMonth = input?.cycleMonth ?? now.getUTCMonth() + 1;
  const cycleStart = new Date(Date.UTC(cycleYear, cycleMonth - 1, 1, 0, 0, 0));
  const cycleEnd = new Date(Date.UTC(cycleYear, cycleMonth, 1, 0, 0, 0));
  return {
    cycleYear,
    cycleMonth,
    cycleStart,
    cycleEnd,
  };
}

export function readSettlementAmountsFromLineItems(lineItemsSnapshot: unknown): {
  baseTotalAmount: number;
  addOnTotalAmount: number;
} {
  const lineItems = asJsonObject(lineItemsSnapshot);

  return {
    baseTotalAmount: asNumberOrZero(lineItems.baseTotalAmount),
    addOnTotalAmount: asNumberOrZero(lineItems.addOnTotalAmount),
  };
}

export function buildSettlementSummary(
  orders: Array<{ lineItemsSnapshot: unknown }>,
) {
  const totals = orders.reduce(
    (acc, order) => {
      const amounts = readSettlementAmountsFromLineItems(
        order.lineItemsSnapshot,
      );
      acc.baseTotalAmount += amounts.baseTotalAmount;
      acc.addOnTotalAmount += amounts.addOnTotalAmount;
      return acc;
    },
    {
      baseTotalAmount: 0,
      addOnTotalAmount: 0,
    },
  );
  return {
    ...totals,
    grandTotalAmount: totals.baseTotalAmount + totals.addOnTotalAmount,
  };
}

export function buildAdminAdjustedLineItemsSnapshot(input: {
  lineItemsSnapshot: unknown;
  adjustment:
    | { type: "FIXED"; amountCents: number }
    | { type: "PERCENT_DISCOUNT"; percent: number };
  reason: string;
  adjustedByUserId: string;
}) {
  const current = asJsonObject(input.lineItemsSnapshot);
  const baseTotalAmount = asNumberOrZero(current.baseTotalAmount);
  const addOnTotalAmount = asNumberOrZero(current.addOnTotalAmount);
  const originalGrandTotalAmount = baseTotalAmount + addOnTotalAmount;

  if (originalGrandTotalAmount <= 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Die Bestellung hat keinen anpassbaren Gesamtbetrag.",
    });
  }

  const finalGrandTotalAmount =
    input.adjustment.type === "FIXED"
      ? input.adjustment.amountCents
      : Math.max(
          0,
          Math.round(
            originalGrandTotalAmount * (1 - input.adjustment.percent / 100),
          ),
        );

  if (finalGrandTotalAmount > originalGrandTotalAmount) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Der finale Betrag darf nicht groesser als der Originalbetrag sein.",
    });
  }

  const quantityRaw = asNumberOrZero(current.quantity);
  const quantity = quantityRaw > 0 ? quantityRaw : 1;
  const ratio = finalGrandTotalAmount / originalGrandTotalAmount;
  const adjustedBaseTotalAmount = Math.max(
    0,
    Math.round(baseTotalAmount * ratio),
  );
  const adjustedAddOnTotalAmount = Math.max(
    0,
    finalGrandTotalAmount - adjustedBaseTotalAmount,
  );

  return {
    ...current,
    baseTotalAmount: adjustedBaseTotalAmount,
    addOnTotalAmount: adjustedAddOnTotalAmount,
    baseUnitAmount: Math.round(adjustedBaseTotalAmount / quantity),
    addOnUnitAmount: Math.round(adjustedAddOnTotalAmount / quantity),
    adminSettlementAdjustment: {
      type: input.adjustment.type,
      value:
        input.adjustment.type === "FIXED"
          ? input.adjustment.amountCents
          : input.adjustment.percent,
      originalGrandTotalAmount,
      finalGrandTotalAmount,
      reason: input.reason,
      adjustedByUserId: input.adjustedByUserId,
      adjustedAt: new Date().toISOString(),
    },
  };
}
