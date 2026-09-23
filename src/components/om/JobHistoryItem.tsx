"use client";

// 1 แถวในไทม์ไลน์ประวัติงานบริการ — รูปทรงเดียวกับ ActivityItem ของฝั่งขาย
// (จุดกลม w-8 h-8 + เส้นแนวตั้ง w-px ที่ตัดทิ้งเมื่อเป็นแถวสุดท้าย)
// ★ เนื้อในเป็นของ O&M เอง เพราะ ActivityItem ผูกกับชนิดข้อมูลของ lead ทั้งก้อน
//   (old_status/new_status/contact_result + STATUS_CONFIG ของงานขาย) ยกมาใช้ตรง ๆ ไม่ได้

import { CALL_OUTCOME } from "@/lib/om/booking";
import { thDT, type HistoryRow } from "@/lib/om/service-view";

// สีจุดตามชนิดเหตุการณ์ — ใช้โทนเดียวกับป้ายสถานะงานบริการ
const DOT: Record<string, string> = {
  call: "bg-gray-500",
  create: "bg-amber-500",
  confirm: "bg-blue-600",
  assign_team: "bg-indigo-500",
  reschedule: "bg-amber-600",
  reorder: "bg-gray-400",
  start: "bg-violet-600",
  check: "bg-teal-600",
  done: "bg-emerald-600",
  cancel: "bg-red-500",
  no_show: "bg-rose-500",
};

export default function JobHistoryItem({ h, isLast }: { h: HistoryRow; isLast?: boolean }) {
  const outcome = h.outcome ? CALL_OUTCOME[h.outcome]?.t ?? h.outcome : null;
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${DOT[h.action] ?? "bg-gray-400"}`}>
          <span className="w-2 h-2 rounded-full bg-white" />
        </div>
        {!isLast && <div className="w-px flex-1 bg-gray-200 mt-1" />}
      </div>

      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-bold text-gray-900">{h.action_label ?? h.action}</span>
          {outcome && <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full">{outcome}</span>}
          {h.booking_id && <span className="text-xxs text-gray-400">ใบงาน #{h.booking_id}</span>}
        </div>
        {h.reason && <div className="text-sm text-gray-600 mt-0.5 break-words">{h.reason}</div>}
        <div className="text-xs text-gray-400 mt-0.5">
          {thDT(h.created_at)} · {h.actor_name ?? "—"}
          {h.next_action_date && <> · นัดต่อ {h.next_action_date}</>}
        </div>
      </div>
    </div>
  );
}
