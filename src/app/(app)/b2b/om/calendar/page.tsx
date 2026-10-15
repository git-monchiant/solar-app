"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import { apiFetch } from "@/lib/api";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { B2B_OM_ROLES, addMonthsIso, thaiMonth, todayThIso, visitStepTone, type B2bOmVisitRow } from "@/lib/b2b/om";

// ปฏิทิน O&M B2B — แยกจากปฏิทิน O&M บ้าน (เคาะ 15 ต.ค. · แผน 20261015-09) · เดือนละหน้า เริ่มวันอาทิตย์
//   นัดที่หลายวันขึ้นทุกวันที่เข้างาน · ข้างปฏิทิน = ครั้งที่กำหนดเดือนนี้แต่ยังไม่นัด · กดไปหน้าสัญญา
const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export default function B2bOmCalendarPage() {
  const router = useRouter();
  const { activeRoles } = useActiveRoles();
  const canUse = hasRole(activeRoles, ...B2B_OM_ROLES);
  const today = todayThIso();
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`);
  const [data, setData] = useState<{ month: string; rows: B2bOmVisitRow[] } | null>(null);
  const rows = data?.month === month ? data.rows : null;

  // ตารางเริ่มวันอาทิตย์ก่อนวันที่ 1 · 6 สัปดาห์
  const gridStart = useMemo(() => addDays(month, -new Date(`${month}T00:00:00Z`).getUTCDay()), [month]);
  const gridEnd = addDays(gridStart, 41);
  const monthEnd = addDays(addMonthsIso(month, 1), -1);

  useEffect(() => {
    if (!canUse) return;
    apiFetch(`/api/b2b/om/calendar?from=${gridStart}&to=${gridEnd}`)
      .then((r: B2bOmVisitRow[]) => setData({ month, rows: r })).catch(() => setData({ month, rows: [] }));
  }, [canUse, month, gridStart, gridEnd]);

  const byDay = useMemo(() => {
    const m = new Map<string, B2bOmVisitRow[]>();
    for (const r of rows ?? []) {
      if (!r.scheduled_date || r.status === "skipped") continue;
      for (let i = 0; i < Math.max(r.days ?? 1, 1); i++) {
        const d = addDays(r.scheduled_date, i);
        m.set(d, [...(m.get(d) ?? []), r]);
      }
    }
    return m;
  }, [rows]);
  const unscheduled = (rows ?? []).filter((r) => r.status === "planned" && r.due_date >= month && r.due_date <= monthEnd);

  if (activeRoles.length > 0 && !canUse) {
    return (
      <div>
        <Header title="ปฏิทิน O&M B2B" subtitle="O&M B2B" />
        <main className="p-3 md:p-6"><div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">role ที่กำลังใช้งานไม่มีสิทธิ์เปิดหน้านี้</div></main>
      </div>
    );
  }

  const go = (r: B2bOmVisitRow) => router.push(`/b2b/om/contracts/${r.contract_id}?visit=${r.id}`);
  const nav = "h-8 px-3 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50";
  return (
    <div>
      <Header title="ปฏิทิน O&M B2B" subtitle="นัดล้างแผง + ตรวจระบบ (แยกจาก O&M บ้าน)" />
      <div className="p-3 md:p-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={nav} onClick={() => setMonth(addMonthsIso(month, -1))} aria-label="เดือนก่อน">‹</button>
          <h2 className="min-w-[9rem] text-center text-base font-bold text-gray-900">{new Date(`${month}T00:00:00Z`).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
          <button type="button" className={nav} onClick={() => setMonth(addMonthsIso(month, 1))} aria-label="เดือนถัดไป">›</button>
          <button type="button" className={nav} onClick={() => setMonth(`${today.slice(0, 7)}-01`)}>เดือนนี้</button>
          {!rows && <span className="text-xs text-gray-400">กำลังโหลด…</span>}
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_18rem] items-start">
          <div className="rounded-xl border border-gray-300 bg-white overflow-hidden">
            <div className="grid grid-cols-7 bg-gray-50 text-center text-xs font-semibold text-gray-500">
              {DOW.map((d) => <div key={d} className="py-1.5">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {Array.from({ length: 42 }, (_, i) => {
                const d = addDays(gridStart, i);
                const inMonth = d >= month && d <= monthEnd;
                const items = byDay.get(d) ?? [];
                return (
                  <div key={d} className={`min-h-[5.5rem] border-t border-l border-gray-100 p-1 ${inMonth ? "bg-white" : "bg-gray-50/60"} ${i % 7 === 0 ? "border-l-0" : ""}`}>
                    <div className={`text-xs tabular-nums mb-0.5 ${d === today ? "inline-flex w-5 h-5 items-center justify-center rounded-full bg-active text-white font-bold" : inMonth ? "text-gray-700" : "text-gray-300"}`}>
                      {Number(d.slice(8))}
                    </div>
                    <div className="space-y-0.5">
                      {items.map((r) => (
                        <button key={r.id} type="button" onClick={() => go(r)} style={{ minHeight: 0 }} title={`${r.project_name} · ครั้งที่ ${r.seq_no}/${r.visits_total}${r.lead_name ? ` · ${r.lead_name}` : ""}`}
                          className={`block w-full truncate rounded px-1 py-0.5 text-left text-xs font-semibold ${visitStepTone(r.step)}`}>
                          {r.project_name}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
        </div>
      </div>
    </div>
  );
}
