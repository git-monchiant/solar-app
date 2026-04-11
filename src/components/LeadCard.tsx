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
      <div className="p-4">
        {/* Row 1: Name + status pill */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="font-bold text-base text-gray-900 truncate">
            {lead.full_name}
            {isUpgrade && <span className="ml-1.5 text-xs font-semibold text-purple-600">·UPGRADE</span>}
          </div>
          <span className={`shrink-0 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md text-white ${config.color}`}>
            {config.label}
          </span>
        </div>

        {/* Row 2: meta inline */}
        <div className="text-sm text-gray-500 truncate">
          {lead.phone && <span className="font-mono tabular-nums">{lead.phone}</span>}
          {lead.phone && lead.project_name && " · "}
          {lead.project_name && <span>{lead.project_name}</span>}
          {(lead.phone || lead.project_name) && lead.house_number && " · "}
          {lead.house_number && <span className="font-mono tabular-nums">{lead.house_number}</span>}
          {aging > 0 && <span className="text-gray-400"> · {aging} วัน</span>}
        </div>

        {/* Row 3: package */}
        {lead.package_name && (
          <div className="text-sm text-gray-700 truncate mt-1">{lead.package_name}</div>
        )}

        {/* Row 4: warning + booking (only if present) */}
        {!compact && (lead.next_follow_up || lead.booking_number || (lead.status === "lost" && lead.revisit_date)) && (
          <div className="mt-2 space-y-0.5">
            {lead.next_follow_up && (
              <div className={`text-sm font-medium ${isOverdue ? "text-red-600" : "text-amber-600"}`}>
                {isOverdue ? "เลยกำหนด" : "นัด"} {formatDate(lead.next_follow_up)}
              </div>
            )}
            {lead.status === "lost" && lead.revisit_date && (
              <div className="text-sm text-blue-600 font-medium">นัดกลับ {formatDate(lead.revisit_date)}</div>
            )}
            {lead.booking_number && (
              <div className="text-sm font-semibold text-emerald-700 font-mono tabular-nums">
                {lead.booking_number} · {formatPrice(lead.booking_price || 0)} ฿
              </div>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
