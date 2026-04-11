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
}

const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);
const formatDate = (d: string) => new Date(d).toLocaleDateString("th-TH", { day: "numeric", month: "short" });

export default function LeadCard({ lead, compact }: { lead: LeadData; compact?: boolean }) {
  const config = STATUS_CONFIG[lead.status] || STATUS_CONFIG.registered;
  const startDate = lead.contact_date || lead.created_at;
  const aging = startDate ? Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000) : 0;
  const isUpgrade = lead.customer_type?.includes("Upgrade") || lead.customer_type?.includes("เดิม");
  const isOverdue = lead.next_follow_up && new Date(lead.next_follow_up) < new Date();

  return (
    <Link
      href={`/leads/${lead.id}`}
      className="block rounded-lg bg-white border border-gray-200 hover:border-gray-300 transition-colors"
    >
      <div className="p-3">
        {/* Row 1: Name + badges */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className={`w-2 h-2 rounded-full shrink-0 ${config.color}`} />
          <span className="font-bold text-sm text-gray-900 truncate flex-1">{lead.full_name}</span>
          {isUpgrade && (
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-purple-50 text-purple-700 border-purple-600/15">
              UPG
            </span>
          )}
          <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-gray-50 text-gray-600 border-gray-200">
            {lead.source === "event" ? "Event" : "Walk"}
          </span>
          {aging > 0 && (
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                aging > 7
                  ? "bg-red-50 text-red-700 border-red-600/15"
                  : aging > 3
                  ? "bg-amber-50 text-amber-700 border-amber-600/15"
                  : "bg-gray-50 text-gray-600 border-gray-200"
              }`}
            >
              {aging}d
            </span>
          )}
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded text-white shrink-0 ${config.color}`}>
            {config.label}
          </span>
        </div>

        {/* Row 2: meta */}
        <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-gray-500 ml-3.5">
          {lead.phone && <span className="font-mono tabular-nums">{lead.phone}</span>}
          {lead.project_name && <span>{lead.project_name}</span>}
          {lead.house_number && <span className="font-mono tabular-nums">#{lead.house_number}</span>}
          {lead.package_name && (
            <span className="font-semibold text-gray-700">
              {lead.package_name}
              {lead.package_price > 0 && ` (${formatPrice(lead.package_price)})`}
            </span>
          )}
        </div>

        {/* Row 3: Last activity / note / follow-up / booking */}
        {!compact && (
          <div className="ml-3.5 mt-1 space-y-0.5">
            {lead.last_activity_note && (
              <div className="text-xs text-gray-500 italic line-clamp-1">&ldquo;{lead.last_activity_note}&rdquo;</div>
            )}
            {lead.next_follow_up && (
              <div className={`text-xs font-medium ${isOverdue ? "text-red-600" : "text-amber-600"}`}>
                Follow-up: {formatDate(lead.next_follow_up)}
                {isOverdue && " (overdue)"}
              </div>
            )}
            {lead.status === "lost" && lead.revisit_date && (
              <div className="text-xs text-blue-600 font-medium">Revisit: {formatDate(lead.revisit_date)}</div>
            )}
            {lead.booking_number && (
              <div className="text-xs font-semibold text-emerald-700 font-mono tabular-nums">
                {lead.booking_number} — {formatPrice(lead.booking_price || 0)} THB
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
