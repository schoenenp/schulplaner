"use client";

import { useState } from "react";
import { ArrowPathIcon, PlusIcon } from "@heroicons/react/16/solid";

import { api } from "@/trpc/react";
import LoadingSpinner from "@/app/_components/loading-spinner";
import { formatCents, formatUnixDate } from "@/util/format";

function randomCouponCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = "";
  for (let i = 0; i < 8; i++) {
    random += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return `PB-${random}`;
}

export default function PlatformCoupons() {
  const utils = api.useUtils();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [feedback, setFeedback] = useState<string | undefined>();

  const [codeDraft, setCodeDraft] = useState(randomCouponCode());
  const [discountType, setDiscountType] = useState<"PERCENT" | "AMOUNT">(
    "PERCENT",
  );
  const [percentDraft, setPercentDraft] = useState("10");
  const [amountDraft, setAmountDraft] = useState("5");
  const [maxRedemptionsDraft, setMaxRedemptionsDraft] = useState("");
  const [validForDaysDraft, setValidForDaysDraft] = useState("");

  const coupons = api.coupon.listPlatformCoupons.useQuery({ includeInactive });

  const createCoupon = api.coupon.createPlatformCoupon.useMutation({
    onSuccess: async (created) => {
      setFeedback(`Coupon ${created.code} wurde erstellt.`);
      setCodeDraft(randomCouponCode());
      await utils.coupon.listPlatformCoupons.invalidate();
    },
    onError: (error) => setFeedback(error.message),
  });

  const toggleCoupon = api.coupon.setPlatformCouponActive.useMutation({
    onSuccess: async () => {
      await utils.coupon.listPlatformCoupons.invalidate();
    },
    onError: (error) => setFeedback(error.message),
  });

  function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const percentOff = Number(percentDraft);
    const amountOffEuro = Number(amountDraft.replace(",", "."));
    const maxRedemptions = maxRedemptionsDraft
      ? Number(maxRedemptionsDraft)
      : undefined;
    const validForDays = validForDaysDraft
      ? Number(validForDaysDraft)
      : undefined;

    createCoupon.mutate({
      code: codeDraft.trim().toUpperCase(),
      maxRedemptions,
      validForDays,
      discount:
        discountType === "PERCENT"
          ? { type: "PERCENT", percentOff }
          : {
              type: "AMOUNT",
              amountOffCents: Math.round(amountOffEuro * 100),
            },
    });
  }

  const items = coupons.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      {feedback ? (
        <div className="glass-card-soft flex items-center justify-between gap-4 border-pirrot-blue-300/25 p-4 text-sm text-pirrot-blue-50">
          <span>{feedback}</span>
          <button
            type="button"
            className="btn-secondary px-3 py-1 text-xs"
            onClick={() => setFeedback(undefined)}
          >
            OK
          </button>
        </div>
      ) : null}

      <section className="glass-card-soft p-5">
        <h4 className="text-lg font-bold text-white">Neuen Coupon erstellen</h4>
        <p className="mt-1 text-sm text-pirrot-blue-100/70">
          Erstellt einen Stripe-Coupon samt Aktionscode für den Shop-Checkout
          (einmalige Einlösung pro Bestellung).
        </p>
        <form
          onSubmit={submitCreate}
          className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
            Code
            <div className="flex gap-2">
              <input
                value={codeDraft}
                onChange={(event) =>
                  setCodeDraft(event.target.value.toUpperCase())
                }
                minLength={6}
                maxLength={32}
                required
                className="soft-input font-mono"
              />
              <button
                type="button"
                className="btn-secondary shrink-0 px-3"
                onClick={() => setCodeDraft(randomCouponCode())}
                aria-label="Zufälligen Code erzeugen"
              >
                <ArrowPathIcon className="size-4" />
              </button>
            </div>
          </label>

          <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
            Rabattart
            <select
              value={discountType}
              onChange={(event) =>
                setDiscountType(event.target.value as "PERCENT" | "AMOUNT")
              }
              className="soft-input"
            >
              <option value="PERCENT">Prozent</option>
              <option value="AMOUNT">Festbetrag (EUR)</option>
            </select>
          </label>

          {discountType === "PERCENT" ? (
            <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
              Rabatt (%)
              <input
                type="number"
                min={1}
                max={100}
                value={percentDraft}
                onChange={(event) => setPercentDraft(event.target.value)}
                required
                className="soft-input"
              />
            </label>
          ) : (
            <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
              Rabatt (EUR)
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={amountDraft}
                onChange={(event) => setAmountDraft(event.target.value)}
                required
                className="soft-input"
              />
            </label>
          )}

          <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
            Max. Einlösungen (optional)
            <input
              type="number"
              min={1}
              value={maxRedemptionsDraft}
              onChange={(event) => setMaxRedemptionsDraft(event.target.value)}
              placeholder="unbegrenzt"
              className="soft-input"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
            Gültig für (Tage, optional)
            <input
              type="number"
              min={1}
              max={365}
              value={validForDaysDraft}
              onChange={(event) => setValidForDaysDraft(event.target.value)}
              placeholder="unbegrenzt"
              className="soft-input"
            />
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              className="btn-primary w-full gap-2"
              disabled={createCoupon.isPending}
            >
              <PlusIcon className="size-4" />
              {createCoupon.isPending ? "Erstellt …" : "Coupon erstellen"}
            </button>
          </div>
        </form>
      </section>

      <section className="glass-card-soft flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-lg font-bold text-white">
            Bestehende Coupons ({items.length})
          </h4>
          <label className="flex items-center gap-2 text-sm text-pirrot-blue-100/80">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
              className="size-4 accent-pirrot-blue-500"
            />
            Inaktive anzeigen
          </label>
        </div>

        {coupons.isPending ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : items.length === 0 ? (
          <p className="py-12 text-center text-sm text-pirrot-blue-100/70">
            Keine Coupons gefunden.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-pirrot-blue-200/10 text-xs uppercase tracking-wide text-pirrot-blue-200/70">
                  <th className="px-3 py-3 font-semibold">Code</th>
                  <th className="px-3 py-3 font-semibold">Rabatt</th>
                  <th className="px-3 py-3 font-semibold">Einlösungen</th>
                  <th className="px-3 py-3 font-semibold">Gültig bis</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {items.map((coupon) => (
                  <tr
                    key={coupon.id}
                    className="border-b border-pirrot-blue-200/5 text-pirrot-blue-50"
                  >
                    <td className="px-3 py-3 font-mono font-semibold text-white">
                      {coupon.code}
                    </td>
                    <td className="px-3 py-3">
                      {coupon.coupon.percentOff
                        ? `${coupon.coupon.percentOff} %`
                        : coupon.coupon.amountOff
                          ? formatCents(
                              coupon.coupon.amountOff,
                              coupon.coupon.currency ?? "EUR",
                            )
                          : "–"}
                    </td>
                    <td className="px-3 py-3">
                      {coupon.timesRedeemed}
                      {coupon.maxRedemptions
                        ? ` / ${coupon.maxRedemptions}`
                        : ""}
                    </td>
                    <td className="px-3 py-3">
                      {coupon.expiresAt
                        ? formatUnixDate(coupon.expiresAt)
                        : "unbegrenzt"}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          coupon.active
                            ? "border-success-400/25 bg-success-950/35 text-success-300"
                            : "border-pirrot-blue-200/15 bg-slate-950/40 text-pirrot-blue-100/60"
                        }`}
                      >
                        {coupon.active ? "Aktiv" : "Inaktiv"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        className="btn-secondary px-3 py-1.5 text-xs"
                        disabled={toggleCoupon.isPending}
                        onClick={() =>
                          toggleCoupon.mutate({
                            promotionCodeId: coupon.id,
                            active: !coupon.active,
                          })
                        }
                      >
                        {coupon.active ? "Deaktivieren" : "Aktivieren"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
