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
  const config = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new;
  const startDate = lead.contact_date || lead.created_at;
  const aging = startDate ? Math.floor((Date.now() - new Date(startDate).getTime()) / 86400000) : 0;
  const isUpgrade = lead.customer_type?.includes("Upgrade") || lead.customer_type?.includes("เดิม");

  return (
    <Link
      href={`/leads/${lead.id}`}
      className="block bg-white rounded-xl border border-gray-100 hover:border-primary/30 active:scale-[0.98] transition-all"
    >
      <div className="p-3">
        {/* Row 1: Name + badges */}
        <div className="flex items-center gap-2 mb-1.5">
          <div className={`w-2 h-2 rounded-full shrink-0 ${config.color}`} />
          <span className="font-bold text-sm truncate flex-1">{lead.full_name}</span>
          {isUpgrade && <span className="text-[10px] font-bold bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">UPG</span>}
          <span className="text-[10px] font-medium bg-gray-100 text-gray px-1.5 py-0.5 rounded">{lead.source === "event" ? "Event" : "Walk"}</span>
          {aging > 0 && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${aging > 7 ? "bg-red-50 text-red-600" : aging > 3 ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray"}`}>
              {aging}d
            </span>
          )}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full text-white ${config.color}`}>
            {config.label}
          </span>
        </div>

        {/* Row 2: Phone + Project + House + Package */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray ml-4">
          {lead.phone && <span>{lead.phone}</span>}
          {lead.project_name && <span>{lead.project_name}</span>}
          {lead.house_number && <span>#{lead.house_number}</span>}
          {lead.package_name && <span className="text-primary font-semibold">{lead.package_name} {lead.package_price > 0 && `(${formatPrice(lead.package_price)})`}</span>}
        </div>

        {/* Row 3: Last activity / note / follow-up */}
        {!compact && (
          <div className="ml-4 mt-1.5 space-y-0.5">
            {lead.last_activity_note && (
              <div className="text-xs text-gray/70 line-clamp-1">&quot;{lead.last_activity_note}&quot;</div>
            )}
            {lead.next_follow_up && (
              <div className={`text-xs font-medium ${new Date(lead.next_follow_up) < new Date() ? "text-red-500" : "text-amber-600"}`}>
                Follow-up: {formatDate(lead.next_follow_up)}
                {new Date(lead.next_follow_up) < new Date() && " (overdue)"}
              </div>
            )}
            {lead.status === "lost" && lead.revisit_date && (
              <div className="text-xs text-blue-600 font-medium">Revisit: {formatDate(lead.revisit_date)}</div>
            )}
            {lead.booking_number && (
              <div className="text-xs font-semibold text-green-600">{lead.booking_number} — {formatPrice(lead.booking_price || 0)} THB</div>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
