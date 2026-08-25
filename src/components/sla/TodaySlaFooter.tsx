"use client";

import { useState } from "react";
import { ClockIcon, UserIcon } from "@/components/ui/icons";
import { formatThaiDateShort, formatThaiTime } from "@/lib/utils/formatters";

export type TodaySlaStatus = "active" | "warning" | "critical" | "breached";

export type TodaySlaItem = {
  id: number;
  lead_id: number;
  policy_code: string;
  task_name: string;
  status: TodaySlaStatus;
  due_at: string;
  full_name: string;
  phone: string;
  customer_grade: string | null;
  source: string | null;
  owner_name: string | null;
  owner_user_id: number | null;
  owner_role: "sales" | "solar";
};

export type TodaySlaSolarUser = { id: number; full_name: string };

const STATUS_LABEL: Record<TodaySlaStatus, string> = {
  active: "กำลังดำเนินการ",
  warning: "ใกล้กำหนด",
  critical: "เร่งด่วน",
  breached: "เกินกำหนด",
};

const STATUS_STYLE: Record<TodaySlaStatus, { row: string; chip: string; dot: string }> = {
  active: { row: "border-sky-200 bg-sky-50/70", chip: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  warning: { row: "border-amber-200 bg-amber-50/70", chip: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  critical: { row: "border-orange-200 bg-orange-50/70", chip: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  breached: { row: "border-red-200 bg-red-50/80", chip: "bg-red-100 text-red-700", dot: "bg-red-500" },
};

function formatOverdueDuration(dueAt: string): string {
  const milliseconds = Date.now() - Date.parse(dueAt);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "เพิ่งเกินกำหนด";
  const totalHours = Math.floor(milliseconds / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `${days.toLocaleString("th-TH")} วัน${hours > 0 ? ` ${hours.toLocaleString("th-TH")} ชม.` : ""}`;
  if (totalHours > 0) return `${totalHours.toLocaleString("th-TH")} ชม.`;
  return `${Math.max(1, Math.floor(milliseconds / 60_000)).toLocaleString("th-TH")} นาที`;
}

export default function TodaySlaFooter({
  items,
  solarUsers,
  currentUserId,
  solarManagerView,
  solarView,
  assigningId,
  onAssignSolar,
}: {
  items: TodaySlaItem[];
  solarUsers: TodaySlaSolarUser[];
  currentUserId?: number;
  solarManagerView: boolean;
  solarView: boolean;
  assigningId: number | null;
  onAssignSolar: (item: TodaySlaItem, userId: number | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? items : items.slice(0, 1);

  return (
    <div
      className="space-y-1.5 border-t border-gray-200 bg-gray-50/60 px-3 py-2 rounded-b-2xl"
      onClick={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
    >
      {visibleItems.map(item => {
        const style = STATUS_STYLE[item.status];
        const canAssignSolar = item.owner_role === "solar" && solarManagerView;
        const canClaimSolar = item.owner_role === "solar" && solarView && !solarManagerView && !item.owner_user_id;
        return (
          <div key={item.id} className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5 text-xs ${style.row}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xxs font-bold ${style.chip}`}>
              SLA {STATUS_LABEL[item.status]}
            </span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xxs font-bold ${
              item.owner_role === "sales"
                ? "bg-violet-100 text-violet-700"
                : "bg-emerald-100 text-emerald-700"
            }`}>
              ทีม {item.owner_role === "sales" ? "Sales" : "Solar"}
            </span>
            <span className="min-w-40 flex-1 font-semibold text-gray-800">{item.task_name}</span>
            {item.status === "breached" ? (
              <span className="inline-flex shrink-0 flex-wrap items-center gap-x-1 whitespace-nowrap font-bold text-red-700">
                <ClockIcon className="h-3.5 w-3.5" />
                เกินมาแล้ว {formatOverdueDuration(item.due_at)}
                <span className="font-normal text-red-500">· กำหนดเดิม {formatThaiDateShort(item.due_at)} {formatThaiTime(item.due_at)}</span>
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-gray-600">
                <ClockIcon className="h-3.5 w-3.5" />
                กำหนด {formatThaiDateShort(item.due_at)} {formatThaiTime(item.due_at)}
              </span>
            )}
            <span className="inline-flex min-w-0 items-center gap-1 text-gray-500">
              <UserIcon className="h-3.5 w-3.5 shrink-0" />
              {canAssignSolar ? (
                <select
                  aria-label="มอบหมายผู้รับผิดชอบทีม Solar"
                  value={item.owner_user_id ?? ""}
                  disabled={assigningId === item.id}
                  onChange={event => onAssignSolar(item, event.target.value ? Number(event.target.value) : null)}
                  className="h-6 max-w-44 rounded-md border border-gray-300 bg-white px-1.5 pr-6 text-xs font-semibold text-gray-700 outline-none focus:border-active disabled:opacity-50"
                >
                  <option value="">ยังไม่มอบหมาย</option>
                  {solarUsers.map(user => <option key={user.id} value={user.id}>{user.full_name}</option>)}
                </select>
              ) : canClaimSolar ? (
                <button
                  type="button"
                  disabled={!currentUserId || assigningId === item.id}
                  onClick={() => currentUserId && onAssignSolar(item, currentUserId)}
                  className="h-6 rounded-md bg-active px-2.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {assigningId === item.id ? "กำลังรับงาน…" : "รับงานนี้"}
                </button>
              ) : (
                <span className="truncate">
                  {item.owner_name || (item.owner_role === "solar" ? "ยังไม่มอบหมายทีม Solar" : "ยังไม่มอบหมาย Owner")}
                  {item.owner_role === "solar" && item.owner_user_id === currentUserId && (
                    <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xxs font-bold text-emerald-700">งานของฉัน</span>
                  )}
                </span>
              )}
            </span>
          </div>
        );
      })}

      {items.length > 1 && (
        <button
          type="button"
          onClick={() => setExpanded(current => !current)}
          className="ml-auto block rounded-full px-2 py-0.5 text-xxs font-bold text-active hover:bg-primary/10"
        >
          {expanded ? "ซ่อนรายการ SLA" : `ดู SLA อีก ${(items.length - 1).toLocaleString("th-TH")} รายการ`}
        </button>
      )}
    </div>
  );
}
