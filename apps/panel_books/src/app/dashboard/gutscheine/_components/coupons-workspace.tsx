"use client";

import { useState } from "react";

import PlatformCoupons from "./platform-coupons";
import PartnerCodes from "./partner-codes";

const TABS = [
  { id: "platform", label: "Plattform-Coupons" },
  { id: "partner", label: "Partner-Codes" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function CouponsWorkspace() {
  const [activeTab, setActiveTab] = useState<TabId>("platform");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={
              activeTab === tab.id
                ? "btn-primary px-4 py-2 text-sm"
                : "btn-secondary px-4 py-2 text-sm"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "platform" ? <PlatformCoupons /> : <PartnerCodes />}
    </div>
  );
}
