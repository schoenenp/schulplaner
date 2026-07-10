"use client";

import { useState } from "react";
import { ArrowPathIcon } from "@heroicons/react/16/solid";

import Modal from "@/app/_components/modal";
import { api } from "@/trpc/react";
import LoadingSpinner from "@/app/_components/loading-spinner";
import { formatUnixDate } from "@/util/format";

const ACTIVE_FILTERS = [
  { value: "ALL", label: "Alle" },
  { value: "ACTIVE", label: "Aktiv" },
  { value: "INACTIVE", label: "Inaktiv" },
] as const;

type ActiveFilter = (typeof ACTIVE_FILTERS)[number]["value"];

type RotateTarget = {
  campaignId: string;
  currentCode: string | null;
};

export default function PartnerCodes() {
  const utils = api.useUtils();
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("ALL");
  const [feedback, setFeedback] = useState<string | undefined>();
  const [rotateTarget, setRotateTarget] = useState<RotateTarget | undefined>();
  const [rotateCodeDraft, setRotateCodeDraft] = useState("");
  const [rotateMaxDraft, setRotateMaxDraft] = useState("");
  const [rotateDaysDraft, setRotateDaysDraft] = useState("");

  const codes = api.coupon.listPartnerCodes.useQuery({
    active:
      activeFilter === "ALL" ? undefined : activeFilter === "ACTIVE",
  });

  const toggleCode = api.coupon.setPartnerCodeActive.useMutation({
    onSuccess: async () => {
      await utils.coupon.listPartnerCodes.invalidate();
    },
    onError: (error) => setFeedback(error.message),
  });

  const rotateCode = api.coupon.rotatePartnerCode.useMutation({
    onSuccess: async (result) => {
      setFeedback(`Neuer Code: ${result.promoCode}`);
      setRotateTarget(undefined);
      await utils.coupon.listPartnerCodes.invalidate();
    },
    onError: (error) => setFeedback(error.message),
  });

  function openRotateModal(target: RotateTarget) {
    setRotateCodeDraft("");
    setRotateMaxDraft("");
    setRotateDaysDraft("");
    setRotateTarget(target);
  }

  function submitRotate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rotateTarget) return;

    rotateCode.mutate({
      campaignId: rotateTarget.campaignId,
      promoCode: rotateCodeDraft.trim() === "" ? undefined : rotateCodeDraft,
      maxRedemptions: rotateMaxDraft ? Number(rotateMaxDraft) : undefined,
      validForDays: rotateDaysDraft ? Number(rotateDaysDraft) : undefined,
    });
  }

  const items = codes.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Modal selector="modal-hook" show={rotateTarget !== undefined}>
        <div className="fixed inset-0 z-[69] flex items-center justify-center bg-slate-950/80 p-4">
          <div className="glass-card w-full max-w-lg p-5">
            <h3 className="text-xl font-bold text-white">
              Partner-Code rotieren
            </h3>
            <p className="mt-2 text-sm text-pirrot-blue-100/75">
              Der bisherige Code {rotateTarget?.currentCode ?? ""} wird
              deaktiviert und durch einen neuen 100%-Code ersetzt.
            </p>
            <form onSubmit={submitRotate} className="mt-5 flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
                Neuer Code (leer = zufällig)
                <input
                  value={rotateCodeDraft}
                  onChange={(event) =>
                    setRotateCodeDraft(event.target.value.toUpperCase())
                  }
                  placeholder="z. B. SP-SCHULE24"
                  className="soft-input font-mono"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
                  Max. Einlösungen
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={rotateMaxDraft}
                    onChange={(event) => setRotateMaxDraft(event.target.value)}
                    placeholder="wie bisher"
                    className="soft-input"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm text-pirrot-blue-100/80">
                  Gültig für (Tage)
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={rotateDaysDraft}
                    onChange={(event) => setRotateDaysDraft(event.target.value)}
                    placeholder="wie bisher"
                    className="soft-input"
                  />
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setRotateTarget(undefined)}
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  className="btn-primary gap-2"
                  disabled={rotateCode.isPending}
                >
                  <ArrowPathIcon className="size-4" />
                  {rotateCode.isPending ? "Rotiert …" : "Code rotieren"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Modal>

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

      <section className="glass-card-soft flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="text-lg font-bold text-white">
            Partner-Kampagnencodes ({items.length})
          </h4>
          <div className="flex gap-2">
            {ACTIVE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setActiveFilter(filter.value)}
                className={
                  activeFilter === filter.value
                    ? "btn-primary px-3 py-1.5 text-sm"
                    : "btn-secondary px-3 py-1.5 text-sm"
                }
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {codes.isPending ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : items.length === 0 ? (
          <p className="py-12 text-center text-sm text-pirrot-blue-100/70">
            Keine Partner-Codes gefunden.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-pirrot-blue-200/10 text-xs uppercase tracking-wide text-pirrot-blue-200/70">
                  <th className="px-3 py-3 font-semibold">Code</th>
                  <th className="px-3 py-3 font-semibold">Partner</th>
                  <th className="px-3 py-3 font-semibold">Einlösungen</th>
                  <th className="px-3 py-3 font-semibold">Gültig bis</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {items.map((code) => (
                  <tr
                    key={code.id}
                    className="border-b border-pirrot-blue-200/5 text-pirrot-blue-50"
                  >
                    <td className="px-3 py-3 font-mono font-semibold text-white">
                      {code.promotionCode ?? "–"}
                    </td>
                    <td className="max-w-56 truncate px-3 py-3">
                      {code.partnerUser?.email ?? code.partnerUserId}
                    </td>
                    <td className="px-3 py-3">
                      {code.timesRedeemed}
                      {code.maxRedemptions ? ` / ${code.maxRedemptions}` : ""}
                    </td>
                    <td className="px-3 py-3">
                      {code.expiresAt
                        ? formatUnixDate(code.expiresAt)
                        : "unbegrenzt"}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          code.promotionActive
                            ? "border-success-400/25 bg-success-950/35 text-success-300"
                            : "border-pirrot-blue-200/15 bg-slate-950/40 text-pirrot-blue-100/60"
                        }`}
                      >
                        {code.promotionActive ? "Aktiv" : "Inaktiv"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn-secondary px-3 py-1.5 text-xs"
                          disabled={toggleCode.isPending}
                          onClick={() =>
                            toggleCode.mutate({
                              campaignId: code.id,
                              active: !code.promotionActive,
                            })
                          }
                        >
                          {code.promotionActive ? "Deaktivieren" : "Aktivieren"}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary px-3 py-1.5 text-xs"
                          onClick={() =>
                            openRotateModal({
                              campaignId: code.id,
                              currentCode: code.promotionCode,
                            })
                          }
                        >
                          Rotieren
                        </button>
                      </div>
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
