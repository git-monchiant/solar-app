import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { STATUS_CONFIG, getStatusLabel } from "@/lib/constants/statuses";
import AssignOwnerButton from "./AssignOwnerButton";

export interface LeadData {
  id: number;
  full_name: string;
  phone: string;
  project_name: string;
  package_name: string;
  package_price: number;
  installation_address: string;
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
  pre_doc_no: string | null;
  pre_total_price: number | null;
  quotation_amount: number | null;
  order_total: number | null;
  install_extra_cost: number | null;
  assigned_user_id: number | null;
  assigned_name: string | null;
  install_date: string | null;
  install_completed_at: string | null;
  created_at: string;
  survey_date: string | null;
  survey_time_slot: string | null;
  line_id: string | null;
  district: string | null;
  province: string | null;
  zone?: string | null;
}

const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);
const formatDate = (d: string) => new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" });
const SURVEY_TIME_LABEL: Record<string, string> = {
  morning: "09:00 - 12:00",
  afternoon: "13:00 - 16:00",
};

export default function LeadCard({ lead, compact, onAssignChange }: { lead: LeadData; compact?: boolean; onAssignChange?: () => void }) {
  const router = useRouter();
  const config = STATUS_CONFIG[lead.status] || STATUS_CONFIG.pre_survey;
  const isUpgrade = lead.customer_type?.includes("Upgrade") || lead.customer_type?.includes("เดิม");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); }, []);
  const startDate = lead.contact_date || lead.created_at;
  const aging = now && startDate ? Math.floor((now - new Date(startDate).getTime()) / 86400000) : 0;
  const isOverdue = now && lead.next_follow_up && new Date(String(lead.next_follow_up).slice(0, 10) + "T12:00:00").getTime() < now;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/leads/${lead.id}`)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/leads/${lead.id}`); } }}
      className="block rounded-2xl bg-white border border-gray-300 shadow-sm hover:border-gray-400 hover:shadow-md transition-all cursor-pointer"
    >
      <div className="p-5">
        {/* Header: name + status */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="font-bold text-lg text-gray-900 truncate leading-tight">
              {lead.full_name}
            </div>
            <div className="text-sm text-gray-500 truncate mt-0.5 font-mono tabular-nums flex items-center gap-1.5">
              {lead.phone}
              {lead.line_id && (
                <svg className="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.44 3.317V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" /></svg>
              )}
            </div>
          </div>
          <span className={`shrink-0 text-xs font-semibold uppercase tracking-wide px-2.5 py-0.5 rounded-full text-white ${config.color}`}>
            {getStatusLabel(lead)}
          </span>
        </div>

        {/* Location */}
        {(lead.project_name || lead.installation_address) && (
          <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-2">
            <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            <span className="truncate">
              {lead.project_name}
              {(lead.district || lead.province) && (
                <span className="text-gray-400"> · {[lead.district, lead.province].filter(Boolean).join(", ")}</span>
              )}
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

        {/* Latest milestone date: ส่งมอบ → นัดติดตั้ง → นัด survey */}
        {(() => {
          let showDate: string | null = null;
          let label = "";
          let showTime = false;
          if (lead.install_completed_at) {
            showDate = lead.install_completed_at;
            label = "ส่งมอบ";
          } else if (lead.install_date) {
            showDate = lead.install_date;
            label = "นัดติดตั้ง";
          } else if (lead.survey_date) {
            showDate = lead.survey_date;
            label = "นัด Survey";
            showTime = true;
          }
          if (!showDate) return null;
          return (
            <div className="flex items-center gap-1.5 text-sm text-gray-700 font-medium mt-1">
              <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
              </svg>
              <span className="font-bold text-gray-900">{formatDate(showDate)}</span>
              {showTime && lead.survey_time_slot ? (
                <span className="font-mono tabular-nums text-gray-600">
                  · {SURVEY_TIME_LABEL[lead.survey_time_slot] || lead.survey_time_slot}
                </span>
              ) : (
                <span className="text-xs text-gray-500">· {label}</span>
              )}
            </div>
          );
        })()}

        {/* Footer: meta + zone */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
            <AssignOwnerButton
              leadId={lead.id}
              assignedUserId={lead.assigned_user_id}
              assignedName={lead.assigned_name}
              onChanged={onAssignChange}
            />
            {isUpgrade && (
              <span className="font-semibold text-purple-600 uppercase tracking-wider">Upgrade</span>
            )}
            {aging > 0 && <span>{aging} วันแล้ว</span>}
            {!compact && lead.next_follow_up && (
              <span className={`font-semibold ${isOverdue ? "text-red-600" : "text-amber-600"}`}>
                · {isOverdue ? "Overdue" : "Follow-up"} {formatDate(lead.next_follow_up)}
              </span>
            )}
            {!compact && lead.pre_doc_no && (() => {
              // Show the most relevant amount based on stage:
              // order/install/warranty/gridtie/closed → order_total (or quotation_amount fallback)
              // quote → quotation_amount
              // earlier → pre_total_price (deposit)
              const later = ["order", "install", "warranty", "gridtie", "closed"].includes(lead.status);
              const base = later
                ? (lead.order_total || lead.quotation_amount || lead.pre_total_price || 0)
                : lead.status === "quote"
                ? (lead.quotation_amount || lead.pre_total_price || 0)
                : (lead.pre_total_price || 0);
              const amount = later ? base + (lead.install_extra_cost || 0) : base;
              return (
                <span className="font-semibold text-emerald-700 font-mono tabular-nums">· {formatPrice(amount)} ฿</span>
              );
            })()}
          </div>
          {lead.zone && (
            <div className="text-xs text-gray-400 truncate shrink-0">
              {lead.zone}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
