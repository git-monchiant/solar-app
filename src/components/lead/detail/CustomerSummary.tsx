"use client";

import { useState } from "react";
import { getSourceStyle } from "@/lib/source-tag";
import { formatTHB as formatPrice, formatThaiDate as formatDate } from "@/lib/utils/formatters";

interface Lead {
  full_name: string;
  phone: string;
  project_name: string;
  installation_address: string;
  customer_type: string;
  source: string;
  package_name: string;
  package_price: number;
  contact_date: string;
  next_follow_up: string | null;
  payment_type: string | null;
  finance_status: string | null;
  requirement: string | null;
  assigned_staff: string | null;
  pre_doc_no: string | null;
  pre_total_price: number | null;
  created_at: string;
}

export default function CustomerSummary({ lead }: { lead: Lead }) {
  const [expanded, setExpanded] = useState(false);

  // Aging: days since contact_date or created_at
  const startDate = lead.contact_date || lead.created_at;
  const aging = startDate ? Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000) : 0;

  return (
    <div className="bg-white border-b border-gray-100">
      {/* Main row - always visible */}
      <button onClick={() => setExpanded(!expanded)} className="w-full px-4 py-3 flex items-center gap-3 text-left">
        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
          <span className="text-primary font-bold">{lead.full_name.charAt(0)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold truncate">{lead.full_name}</div>
          <div className="flex items-center gap-2 text-xs text-gray mt-0.5 flex-wrap">
            {lead.phone && <span>{lead.phone}</span>}
            {lead.project_name && <span>{lead.project_name}</span>}
            {lead.installation_address && <span>#{lead.installation_address}</span>}
            {lead.source && <span className="text-xs font-medium bg-gray-100 px-1.5 py-0.5 rounded">{getSourceStyle(lead.source).label}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {aging > 0 && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${aging > 7 ? "bg-red-50 text-red-600" : aging > 3 ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray"}`}>
              {aging}d
            </span>
          )}
          <svg className={`w-4 h-4 text-gray/40 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {/* Expanded details */}
      <div className={`overflow-hidden transition-all duration-200 ${expanded ? "max-h-96" : "max-h-0"}`}>
        <div className="px-4 pb-3 space-y-2 text-sm">
          {[
            { label: "Package", value: lead.package_name, extra: lead.package_price > 0 ? ` (${formatPrice(lead.package_price)} THB)` : "", color: "text-primary" },
            { label: "Type", value: lead.customer_type },
            { label: "Requirement", value: lead.requirement },
            { label: "Payment", value: lead.payment_type === "cash" ? "Cash" : lead.payment_type === "home_equity" ? "Home Equity" : lead.payment_type === "finance" ? "Finance" : lead.payment_type, color: "text-green-600" },
            { label: "Finance Status", value: lead.finance_status === "pending" ? "Pending" : lead.finance_status === "approved" ? "Approved" : lead.finance_status === "rejected" ? "Rejected" : null, color: lead.finance_status === "approved" ? "text-green-600" : lead.finance_status === "rejected" ? "text-red-600" : "text-amber-600" },
            { label: "Contact Date", value: lead.contact_date ? formatDate(lead.contact_date) : null },
            { label: "Follow Up", value: lead.next_follow_up ? formatDate(lead.next_follow_up) : null, color: "text-red-500" },
            { label: "Staff", value: lead.assigned_staff },
            { label: "Pre-Survey Doc", value: lead.pre_doc_no, extra: lead.pre_total_price ? ` — ${formatPrice(lead.pre_total_price)} THB` : "" },
          ].filter(r => r.value).map(r => (
            <div key={r.label} className="flex justify-between">
              <span className="text-gray">{r.label}</span>
              <span className={`font-medium ${r.color || ""}`}>{r.value}{r.extra || ""}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
