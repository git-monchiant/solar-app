"use client";

import Link from "next/link";
import { apiFetch } from "@/lib/api";
import type { StepCommonProps } from "./types";

const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);

export default function QuotationStep({ lead, state, refresh }: StepCommonProps) {
  const markSent = async () => {
    await apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "purchased" }),
    });
    refresh();
  };

  if (state === "done") {
    return (
      <div className="text-sm">
        <span className="text-emerald-700 font-semibold">Quotation sent</span>
        {lead.package_name && (
          <span className="text-gray-500"> — {lead.package_name} ({formatPrice(lead.package_price)} THB)</span>
        )}
      </div>
    );
  }

  if (state !== "active") return null;

  return (
    <div className="space-y-2">
      <div className="text-sm text-gray-500">Send quotation and wait for customer decision</div>
      <div className="flex gap-2">
        <Link
          href="/packages"
          className="flex-1 rounded-md text-sm font-semibold border border-gray-200 text-gray-700 hover:border-gray-400 text-center flex items-center justify-center transition-colors"
        >
          Show Packages
        </Link>
        <button
          onClick={markSent}
          className="flex-1 rounded-md text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 transition-colors"
        >
          Accepted
        </button>
      </div>
    </div>
  );
}
