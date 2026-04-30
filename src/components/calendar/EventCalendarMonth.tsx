"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

// Month-grid sibling of EventCalendarList. Same data source
// (/api/surveys/scheduled) — different layout. Shows up to 4 events per cell.

type ScheduledEvent = {
  id: number;
  full_name: string;
  house_number: string | null;
  event_date: string;
  time_slot: string | null;
  event_type: string;
  status: string;
  zone: string | null;
};

const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const TH_DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface MonthProps {
  toolbarRight?: React.ReactNode;
  // Controlled month — when provided, parent owns nav state and the
  // component hides its internal toolbar.
  year?: number;
  month?: number;
  hideNav?: boolean;
  // Fired when user clicks an empty day cell — used by the parent to open a
  // "create appointment" modal pre-filled with that date.
  onEmptyDayClick?: (dateKey: string) => void;
}

export default function EventCalendarMonth({ toolbarRight, year: controlledYear, month: controlledMonth, hideNav = false, onEmptyDayClick }: MonthProps) {
  const router = useRouter();
  const today = new Date();
  const [internalYear, setInternalYear] = useState(today.getFullYear());
  const [internalMonth, setInternalMonth] = useState(today.getMonth());
  const year = controlledYear ?? internalYear;
  const month = controlledMonth ?? internalMonth;
  const setYear = setInternalYear;
  const setMonth = setInternalMonth;
  const [events, setEvents] = useState<ScheduledEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/surveys/scheduled").then(setEvents).catch(console.error).finally(() => setLoading(false));
  }, []);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduledEvent[]>();
    for (const e of events) {
      const k = String(e.event_date).slice(0, 10);
      const arr = map.get(k) ?? [];
      arr.push(e);
      map.set(k, arr);
    }
    return map;
  }, [events]);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [year, month]);

  const todayKey = ymd(today);

  const prevMonth = () => { if (month === 0) { setYear(year - 1); setMonth(11); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 11) { setYear(year + 1); setMonth(0); } else setMonth(month + 1); };
  const goToday = () => { const t = new Date(); setYear(t.getFullYear()); setMonth(t.getMonth()); };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button type="button" onClick={prevMonth} className="w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <button type="button" onClick={nextMonth} className="w-9 h-9 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>
        <button type="button" onClick={goToday} className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-semibold hover:bg-gray-50">วันนี้</button>
        <div className="text-base md:text-lg font-bold ml-2">{TH_MONTHS[month]} {year + 543}</div>
        {toolbarRight && <div className="ml-auto">{toolbarRight}</div>}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
          {TH_DAYS.map((d, i) => (
            <div key={d} className={`px-2 py-2 text-xs font-bold text-center ${i === 0 || i === 6 ? "text-red-500" : "text-gray-500"}`}>{d}</div>
          ))}
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const inMonth = d.getMonth() === month;
              const key = ymd(d);
              const evs = eventsByDay.get(key) ?? [];
              const isToday = key === todayKey;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              const dayCls = isToday
                ? "inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-white"
                : !inMonth
                  ? (isWeekend ? "text-red-300" : "text-gray-300")
                  : (isWeekend ? "text-red-500" : "text-gray-700");
              const onCellClick = (e: React.MouseEvent) => {
                if (!onEmptyDayClick || !inMonth) return;
                // Only fire if user clicked the empty area (not on an event button).
                if ((e.target as HTMLElement).closest("button")) return;
                onEmptyDayClick(key);
              };
              return (
                <div key={i} onClick={onCellClick}
                  className={`min-h-[88px] md:min-h-[110px] border-b border-r border-gray-100 p-1.5 ${inMonth ? (onEmptyDayClick ? "cursor-pointer hover:bg-gray-50" : "") : "bg-gray-50/40"}`}>
                  <div className={`text-xs font-semibold mb-1 ${dayCls}`}>{d.getDate()}</div>
                  <div className="space-y-1">
                    {evs.slice(0, 4).map((ev, j) => {
                      const isBlock = ev.event_type === "block";
                      const isSurvey = !isBlock && (ev.status === "survey" || ev.event_type === "survey");
                      const color = isBlock
                        ? "bg-gray-100 text-gray-700 border-gray-300"
                        : isSurvey
                          ? "bg-violet-50 text-violet-700 border-violet-200"
                          : "bg-emerald-50 text-emerald-700 border-emerald-200";
                      const kindLabel = isBlock ? "งานอื่น" : isSurvey ? "สำรวจ" : "ติดตั้ง";
                      const handleClick = () => { if (!isBlock) router.push(`/leads/${ev.id}`); };
                      return (
                        <button
                          key={`${ev.id}-${ev.event_type}-${j}`}
                          type="button"
                          onClick={handleClick}
                          disabled={isBlock}
                          className={`w-full text-left text-[11px] leading-tight px-1.5 py-1 rounded border ${color} ${isBlock ? "cursor-default" : "hover:brightness-95"} truncate inline-flex items-center gap-1`}
                          title={`${kindLabel}: ${ev.house_number ? ev.house_number + " - " : ""}${ev.full_name}`}
                        >
                          {isBlock ? (
                            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          ) : isSurvey ? (
                            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                            </svg>
                          )}
                          <span className="truncate">{ev.house_number ? `${ev.house_number} - ${ev.full_name}` : ev.full_name}</span>
                        </button>
                      );
                    })}
                    {evs.length > 4 && (
                      <div className="text-[10px] text-gray-400 px-1">+{evs.length - 4} เพิ่มเติม</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
