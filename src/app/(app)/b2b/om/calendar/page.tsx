"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { apiFetch } from "@/lib/api";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { B2B_OM_ROLES, thaiMonth, visitStepTone, type B2bOmVisitRow } from "@/lib/b2b/om";
import MonthCalendar, { monthGrid, thisMonthIso } from "@/components/b2b/MonthCalendar";

// ปฏิทิน O&M B2B — แยกจากปฏิทิน O&M บ้าน (เคาะ 15 ต.ค. · แผน 20261015-09) · ตัวปฏิทินใช้ร่วมกับปฏิทินนัดสำรวจ B2B
//   นัดที่หลายวันขึ้นทุกวันที่เข้างาน · ข้างปฏิทิน = ครั้งที่กำหนดเดือนนี้แต่ยังไม่นัด · กดไปหน้าสัญญา
export default function B2bOmCalendarPage() {
  const router = useRouter();
  const { activeRoles } = useActiveRoles();
  const canUse = hasRole(activeRoles, ...B2B_OM_ROLES);
  const [month, setMonth] = useState(thisMonthIso);
  const [data, setData] = useState<{ month: string; rows: B2bOmVisitRow[] } | null>(null);
  const rows = data?.month === month ? data.rows : null;
  const { start, end, monthEnd } = monthGrid(month);

  useEffect(() => {
    if (!canUse) return;
    apiFetch(`/api/b2b/om/calendar?from=${start}&to=${end}`)
      .then((r: B2bOmVisitRow[]) => setData({ month, rows: r })).catch(() => setData({ month, rows: [] }));
  }, [canUse, month, start, end]);

  if (activeRoles.length > 0 && !canUse) {
    return (
      <div>
        <Header title="ปฏิทิน O&M B2B" subtitle="O&M B2B" />
        <main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">role ที่กำลังใช้งานไม่มีสิทธิ์เปิดหน้านี้</div></main>
      </div>
    );
  }

  const go = (r: B2bOmVisitRow) => router.push(`/b2b/om/contracts/${r.contract_id}?visit=${r.id}`);
  const events = (rows ?? []).filter((r) => r.scheduled_date && r.status !== "skipped").map((r) => ({
    key: String(r.id), date: r.scheduled_date!, days: r.days, label: r.project_name, tone: visitStepTone(r.step),
    title: `${r.project_name} · ครั้งที่ ${r.seq_no}/${r.visits_total}${r.lead_name ? ` · ${r.lead_name}` : ""}`, onClick: () => go(r),
  }));
  const unscheduled = (rows ?? []).filter((r) => r.status === "planned" && r.due_date >= month && r.due_date <= monthEnd);
  return (
    <div>
      <Header title="ปฏิทิน O&M B2B" subtitle="นัดล้างแผง + ตรวจระบบ (แยกจาก O&M บ้าน)" />
      <div className="p-3 md:p-6">
        <MonthCalendar month={month} onMonth={setMonth} loading={!rows} events={events} aside={
          <aside className="rounded-xl border border-gray-300 bg-white overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 text-xs font-semibold uppercase tracking-wider text-gray-500">
              กำหนด {thaiMonth(month)} · ยังไม่นัด ({unscheduled.length})
            </div>
            {unscheduled.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">ไม่มี</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {unscheduled.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => go(r)} className="w-full text-left px-4 py-2.5 hover:bg-gray-50">
                      <div className="text-sm font-semibold text-gray-900">{r.project_name}</div>
                      <div className="text-xs text-gray-500">ครั้งที่ {r.seq_no}/{r.visits_total} · {r.customer_name}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        } />
      </div>
    </div>
  );
}
