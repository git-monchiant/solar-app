"use client";

import { useState, type ReactNode } from "react";

// ปฏิทินรายเดือนของโมดูล B2B — ปฏิทินนัดสำรวจ (การ์ดสำรวจ & ติดตั้ง) + ปฏิทิน O&M B2B ใช้ร่วมกัน
// เริ่มวันอาทิตย์ · 6 สัปดาห์ · นัดหลายวันขึ้นทุกวันที่เข้างาน · aside = รายการข้างปฏิทิน (เช่น ยังไม่นัด)
export type CalEvent = { key: string; date: string; days?: number | null; label: string; tone: string; title?: string; onClick?: () => void };

export const addDaysIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const addMonths = (first: string, n: number) => {
  const d = new Date(`${first}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)).toISOString().slice(0, 10);
};
/** ช่วงวันที่ของตาราง 6 สัปดาห์ของเดือน (month = วันที่ 1) — ใช้ขอข้อมูลจาก API */
export function monthGrid(month: string) {
  const start = addDaysIso(month, -new Date(`${month}T00:00:00Z`).getUTCDay());
  return { start, end: addDaysIso(start, 41), monthEnd: addDaysIso(addMonths(month, 1), -1) };
}
export const thisMonthIso = () => `${new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 7)}-01`;

const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export default function MonthCalendar({ month, onMonth, loading, events, aside }: {
  month: string; onMonth: (m: string) => void; loading?: boolean; events: CalEvent[]; aside?: ReactNode;
}) {
  const [today] = useState(() => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10));   // วันนี้ (เวลาไทย) — อ่านครั้งเดียว
  const { start, monthEnd } = monthGrid(month);
  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) {
    for (let i = 0; i < Math.max(e.days ?? 1, 1); i++) {
      const d = addDaysIso(e.date, i);
      byDay.set(d, [...(byDay.get(d) ?? []), e]);
    }
  }
  const nav = "h-8 px-3 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={nav} onClick={() => onMonth(addMonths(month, -1))} aria-label="เดือนก่อน">‹</button>
        <h2 className="min-w-[9rem] text-center text-base font-bold text-gray-900">{new Date(`${month}T00:00:00Z`).toLocaleDateString("th-TH", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
        <button type="button" className={nav} onClick={() => onMonth(addMonths(month, 1))} aria-label="เดือนถัดไป">›</button>
        <button type="button" className={nav} onClick={() => onMonth(thisMonthIso())}>เดือนนี้</button>
        {loading && <span className="text-xs text-gray-400">กำลังโหลด…</span>}
      </div>
      <div className={`grid gap-3 items-start ${aside ? "lg:grid-cols-[1fr_18rem]" : ""}`}>
        <div className="rounded-xl border border-gray-300 bg-white overflow-hidden">
          <div className="grid grid-cols-7 bg-gray-50 text-center text-xs font-semibold text-gray-500">
            {DOW.map((d) => <div key={d} className="py-1.5">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 42 }, (_, i) => {
              const d = addDaysIso(start, i);
              const inMonth = d >= month && d <= monthEnd;
              return (
                <div key={d} className={`min-h-[5.5rem] border-t border-l border-gray-100 p-1 ${inMonth ? "bg-white" : "bg-gray-50/60"} ${i % 7 === 0 ? "border-l-0" : ""}`}>
                  <div className={`text-xs tabular-nums mb-0.5 ${d === today ? "inline-flex w-5 h-5 items-center justify-center rounded-full bg-active text-white font-bold" : inMonth ? "text-gray-700" : "text-gray-300"}`}>
                    {Number(d.slice(8))}
                  </div>
                  <div className="space-y-0.5">
                    {(byDay.get(d) ?? []).map((e) => (
                      <button key={e.key} type="button" onClick={e.onClick} style={{ minHeight: 0 }} title={e.title ?? e.label}
                        className={`block w-full truncate rounded px-1 py-0.5 text-left text-xs font-semibold ${e.tone}`}>
                        {e.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {aside}
      </div>
    </div>
  );
}
