"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { apiFetch } from "@/lib/api";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { B2B_PROJECT_VIEW_ROLES, B2B_STAGE } from "@/lib/b2b/project";
import MonthCalendar, { monthGrid, thisMonthIso } from "@/components/b2b/MonthCalendar";

// ปฏิทินนัดสำรวจ B2B — เมนูแรกของการ์ด "สำรวจ & ติดตั้ง B2B" (แยกสำรวจแบบ B2C · เคาะ 15 ต.ค.)
//   สี: นัดแล้ว (ฟ้า) · ถึง/เลยวันนัดยังไม่บันทึกผล (เหลือง) · สำรวจแล้ว (เขียว) · โครงการแพ้/ยกเลิก (เทา)
//   ข้างปฏิทิน = โครงการขั้นสำรวจที่ยังไม่ได้นัด · กดไปหน้าโครงการ (นัด/บันทึกผลที่การ์ดขั้น 03)
type Item = {
  id: number; code: string; name: string; customer_name: string; location: string | null; stage: number;
  survey_date: string | null; surveyor_name: string | null; survey_done: boolean;
};

export default function B2bSurveyCalendarPage() {
  const router = useRouter();
  const { activeRoles } = useActiveRoles();
  const canUse = hasRole(activeRoles, ...B2B_PROJECT_VIEW_ROLES);
  const [month, setMonth] = useState(thisMonthIso);
  const [today] = useState(() => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10));
  const [data, setData] = useState<{ month: string; events: Item[]; waiting: Item[] } | null>(null);
  const loaded = data?.month === month ? data : null;
  const { start, end } = monthGrid(month);

  useEffect(() => {
    if (!canUse) return;
    apiFetch(`/api/b2b/survey-calendar?from=${start}&to=${end}`)
      .then((r: { events: Item[]; waiting: Item[] }) => setData({ month, ...r })).catch(() => setData({ month, events: [], waiting: [] }));
  }, [canUse, month, start, end]);

  if (activeRoles.length > 0 && !canUse) {
    return (
      <div>
        <Header title="ปฏิทินนัดสำรวจ" subtitle="สำรวจ & ติดตั้ง B2B" />
        <main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">role ที่กำลังใช้งานไม่มีสิทธิ์เปิดหน้านี้</div></main>
      </div>
    );
  }

  const tone = (i: Item) => i.survey_done ? "bg-emerald-50 text-emerald-700"
    : i.stage >= B2B_STAGE.closed ? "bg-gray-100 text-gray-500"
    : i.survey_date! > today ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700";
  const go = (i: Item) => router.push(`/b2b/projects/${i.id}`);
  const events = (loaded?.events ?? []).map((i) => ({
    key: String(i.id), date: i.survey_date!, label: i.name, tone: tone(i), onClick: () => go(i),
    title: `${i.name} · ${i.customer_name}${i.surveyor_name ? ` · ผู้สำรวจ ${i.surveyor_name}` : ""}${i.survey_done ? " · สำรวจแล้ว" : ""}`,
  }));
  const waiting = loaded?.waiting ?? [];
  const legend = [["bg-blue-50 text-blue-700", "นัดแล้ว"], ["bg-amber-50 text-amber-700", "ถึงวันนัด ยังไม่บันทึกผล"], ["bg-emerald-50 text-emerald-700", "สำรวจแล้ว"]];
  return (
    <div>
      <Header title="ปฏิทินนัดสำรวจ" subtitle="สำรวจ & ติดตั้ง B2B" />
      <div className="p-3 md:p-6 space-y-2">
        <div className="flex flex-wrap gap-2 text-xs">
          {legend.map(([c, t]) => <span key={t} className={`rounded px-2 py-0.5 font-semibold ${c}`}>{t}</span>)}
        </div>
        <MonthCalendar month={month} onMonth={setMonth} loading={!loaded} events={events} aside={
          <aside className="rounded-xl border border-gray-300 bg-white overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 text-xs font-semibold uppercase tracking-wider text-gray-500">
              ขั้นสำรวจ · ยังไม่ได้นัด ({waiting.length})
            </div>
            {waiting.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">ไม่มี</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {waiting.map((i) => (
                  <li key={i.id}>
                    <button type="button" onClick={() => go(i)} className="w-full text-left px-4 py-2.5 hover:bg-gray-50">
                      <div className="text-sm font-semibold text-gray-900">{i.name}</div>
                      <div className="text-xs text-gray-500">{i.code} · {i.customer_name}{i.location ? ` · ${i.location}` : ""}</div>
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
