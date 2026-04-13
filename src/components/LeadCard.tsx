import Link from "next/link";
import { STATUS_CONFIG } from "@/lib/statuses";

export interface LeadData {
  id: number;
  full_name: string;
  phone: string;
  project_name: string;
  package_name: string;
  package_price: number;
  house_number: string;
  customer_type: string;
  status: string;
  source: string;
  note: string;
  contact_date: string;
  next_follow_up: string | null;
  revisit_date: string | null;
  lost_reason: string | null;
  last_activity_note: string | null;
  last_activity_date: string | null;
  booking_number: string | null;
  booking_price: number | null;
  booking_status: string | null;
  created_at: string;
  survey_date: string | null;
  survey_time_slot: string | null;
}

const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);
const formatDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
const SURVEY_TIME_LABEL: Record<string, string> = {
  morning: "09:00 - 12:00",
  afternoon: "13:00 - 16:00",
};

export default function LeadCard({ lead, compact }: { lead: LeadData; compact?: boolean }) {
  const config = STATUS_CONFIG[lead.status] || STATUS_CONFIG.registered;
  const startDate = lead.contact_date || lead.created_at;
  const aging = startDate ? Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000) : 0;
  const isUpgrade = lead.customer_type?.includes("Upgrade") || lead.customer_type?.includes("เดิม");
  const isOverdue = lead.next_follow_up && new Date(lead.next_follow_up) < new Date();

  return (
    <Link
      href={`/leads/${lead.id}`}
      className="block rounded-2xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
    >
      <div className="p-5">
        {/* Header: name + status */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-lg text-gray-900 truncate leading-tight">
              {lead.full_name}
            </div>
            <div className="text-sm text-gray-500 truncate mt-0.5 font-mono tabular-nums">
              {lead.phone}
            </div>
          </div>
          <span className={`shrink-0 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full text-white ${config.color}`}>
            {config.label}
          </span>
        </div>

        {/* Location */}
        {(lead.project_name || lead.house_number) && (
          <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-2">
            <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            <span className="truncate">
              {lead.project_name}
              {lead.project_name && lead.house_number && " · "}
              {lead.house_number && <span className="font-mono tabular-nums">{lead.house_number}</span>}
            </span>
          </div>
        )}

        {/* Package */}
        {lead.package_name && (
          <div className="flex items-center gap-1.5 text-sm text-gray-700 font-medium">
            <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
            </svg>
            <span className="truncate">{lead.package_name}</span>
          </div>
        )}

        {/* Survey appointment */}
        {lead.survey_date && (
          <div className="flex items-center gap-1.5 text-sm text-gray-700 font-medium mt-1">
            <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
            </svg>
            <span className="font-bold text-gray-900">{formatDate(lead.survey_date)}</span>
            {lead.survey_time_slot && (
              <span className="font-mono tabular-nums text-gray-600">
                · {SURVEY_TIME_LABEL[lead.survey_time_slot] || lead.survey_time_slot}
              </span>
            )}
          </div>
        )}

        {/* Footer: meta + warnings */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            {isUpgrade && (
              <span className="font-semibold text-purple-600 uppercase tracking-wider">Upgrade</span>
            )}
            {isUpgrade && aging > 0 && <span>·</span>}
            {aging > 0 && <span>{aging} วันแล้ว</span>}
          </div>
          {!compact && lead.next_follow_up && (
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${isOverdue ? "text-red-600" : "text-amber-600"}`}>
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
              </svg>
              <span className="uppercase tracking-wider">{isOverdue ? "Overdue" : "Follow-up"}</span>
              <span className="text-gray-500 normal-case font-normal">{formatDate(lead.next_follow_up)}</span>
            </div>
          )}
          {!compact && lead.booking_number && !lead.next_follow_up && (
            <div className="text-xs font-semibold text-emerald-700 font-mono tabular-nums">
              {formatPrice(lead.booking_price || 0)} ฿
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
