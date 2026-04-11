"use client";

import { apiFetch } from "@/lib/api";
import { PAYMENT_TYPES } from "@/lib/statuses";
import type { StepCommonProps } from "./types";

export default function PurchasedStep({ lead, state, refresh }: StepCommonProps) {
  const paymentLabel = PAYMENT_TYPES.find(p => p.value === lead.payment_type)?.label;

  const markInstalled = async () => {
    await apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "installed" }),
    });
    refresh();
  };

  if (state === "done") {
    return (
      <div className="space-y-0.5">
        <div className="text-sm font-semibold text-emerald-700">Payment confirmed</div>
        {paymentLabel && <div className="text-xs text-gray-500">Method: {paymentLabel}</div>}
      </div>
    );
  }

  if (state !== "active") return null;

  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-500">Collect remaining balance and confirm purchase</div>
      {paymentLabel && (
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10px] font-semibold tracking-wider uppercase text-gray-400">Method</span>
          <span className="text-sm font-semibold text-gray-900">{paymentLabel}</span>
        </div>
      )}
      <button
        onClick={markInstalled}
        className="w-full rounded-md text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 transition-colors"
      >
        Mark Purchased → Start Installation
      </button>
    </div>
  );
}
