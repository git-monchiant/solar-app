"use client";

import { useState } from "react";
import {
  SlaPanel,
  type SlaStatus,
} from "./SlaStatusDisplay";

export type TodaySlaStatus = SlaStatus;

export type TodaySlaItem = {
  id: number;
  lead_id: number;
  policy_code: string;
  task_name: string;
  status: TodaySlaStatus;
  started_at: string;
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
      className="flex h-full flex-col gap-1.5"
      onClick={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
    >
      {visibleItems.map(item => {
        const canAssignSolar = item.owner_role === "solar" && solarManagerView;
        const canClaimSolar = item.owner_role === "solar" && solarView && !solarManagerView && !item.owner_user_id;
        const ownerContent = canAssignSolar ? (
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
        );
        return (
          <div key={item.id} className="flex-1">
            <SlaPanel
              status={item.status}
              policyCode={item.policy_code}
              taskName={item.task_name}
              startedAt={item.started_at}
              dueAt={item.due_at}
              ownerRole={item.owner_role}
              ownerContent={ownerContent}
            />
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
