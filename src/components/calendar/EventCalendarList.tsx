"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getStatusLabel } from "@/lib/constants/statuses";
import { formatSlotsRange } from "@/lib/time-slots";

// List-style calendar view used by Today's "ปฏิทิน" tab and the standalone
// /calendar page. Fetches /api/surveys/scheduled and renders one row per day
// for the next `days` window, grouped by month. Optional zone filter.

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

// Pill background neutral; the colored bar on the left is what carries the
// zone identity. Label text still says survey/install so the row stays
// readable at a glance.
const STATUS_LABEL = (j: ScheduledEvent): string => {
  if (j.event_type === "block") return "งานอื่น";
  if (j.event_type === "survey") return "นัดสำรวจ";
  if (j.event_type === "install") return "นัดติดตั้ง";
  return getStatusLabel(j);
};

// Icon picks the appointment kind so colour can be reserved for zone identity.
function EventIcon({ type }: { type: string }) {
  if (type === "block") {
    return (
      <svg className="w-3.5 h-3.5 shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    );
  }
  if (type === "survey") {
    return (
      <svg className="w-3.5 h-3.5 shrink-0 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    );
  }
  if (type === "install") {
    return (
      <svg className="w-3.5 h-3.5 shrink-0 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    );
  }
  return null;
}

interface Props {
  // Window of months shown around the anchor — default anchors at the
  // current month and renders [anchor .. anchor + monthsForward].
  monthsBack?: number;
  monthsForward?: number;
  days?: number; // legacy
  zoneFilter?: string;
  showZoneChips?: boolean;
  toolbarRight?: React.ReactNode;
  // Controlled anchor — when provided, parent owns the anchor state and
  // renders its own prev/next/today buttons (so the calendar can hide its
  // internal nav).
  anchor?: { y: number; m: number };
  hideNav?: boolean;
  // Controlled zone filter — when provided, parent owns the chips and the
  // component just respects the value.
  controlledZone?: string;
  // Fires whenever the most-visible month section changes due to scroll.
  // Lets the parent's sticky header reflect "what month am I looking at".
  onVisibleMonthChange?: (mk: string) => void;
}

function ymdLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function EventCalendarList({ monthsBack, monthsForward, days, zoneFilter = "all", showZoneChips = false, toolbarRight, anchor: controlledAnchor, hideNav = false, controlledZone, onVisibleMonthChange }: Props) {
  const [events, setEvents] = useState<ScheduledEvent[]>([]);
  const [zones, setZones] = useState<{ id: number; name: string; color?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalZone, setInternalZone] = useState<string>(zoneFilter);
  const selectedZone = controlledZone ?? internalZone;
  const setSelectedZone = setInternalZone;
  // name → hex color, derived once per zones load. Used to tint the row's
  // left bar so "All" view shows team identity at a glance.
  const zoneColor = useMemo(() => {
    const m: Record<string, string> = {};
    for (const z of zones) if (z.color) m[z.name] = z.color;
    return m;
  }, [zones]);

  // Anchor + window. Default anchor = "monthsBack months before today" so the
  // initial render still includes recent past months. Prev/Next move the
  // anchor (re-render); window length stays fixed.
  const initBack = monthsBack ?? (days ? 0 : 1);
  const initForward = monthsForward ?? (days ? Math.ceil(days / 30) : 3);
  const today = useMemo(() => new Date(), []);
  const [internalAnchor, setInternalAnchor] = useState<{ y: number; m: number }>(() => {
    const a = new Date(today.getFullYear(), today.getMonth() - initBack, 1);
    return { y: a.getFullYear(), m: a.getMonth() };
  });
  const anchor = controlledAnchor ?? internalAnchor;
  const setAnchor = setInternalAnchor;
  const windowMonths = initBack + initForward + 1;

  useEffect(() => {
    apiFetch("/api/surveys/scheduled").then(setEvents).catch(console.error).finally(() => setLoading(false));
    // Always fetch zones so we have the color map even when the parent owns
    // the chips (controlledZone case).
    apiFetch("/api/zones").then(setZones).catch(console.error);
  }, []);

  const todayKey = ymdLocal(today);

  const { byMonth, byDate } = useMemo(() => {
    const filtered = selectedZone === "all" ? events : events.filter((s) => s.zone === selectedZone);
    const byDate: Record<string, ScheduledEvent[]> = {};
    for (const s of filtered) {
      const k = String(s.event_date).slice(0, 10);
      (byDate[k] ||= []).push(s);
    }
    const start = new Date(anchor.y, anchor.m, 1);
    const end = new Date(anchor.y, anchor.m + windowMonths, 0);
    const byMonth: Record<string, string[]> = {};
    const cursor = new Date(start);
    while (cursor <= end) {
      const k = ymdLocal(cursor);
      const mk = k.slice(0, 7);
      (byMonth[mk] ||= []).push(k);
      cursor.setDate(cursor.getDate() + 1);
    }
    return { byMonth, byDate };
  }, [events, selectedZone, anchor, windowMonths]);

  const goPrev = () => setAnchor((a) => {
    const d = new Date(a.y, a.m - 1, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const goNext = () => setAnchor((a) => {
    const d = new Date(a.y, a.m + 1, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // Track which month section is currently under the sticky header.
  // A section is active when its top has scrolled past the sticky bar AND
  // its bottom hasn't yet — i.e., the section currently occupies the line
  // right below the sticky toolbar.
  const monthRefs = useRef<Map<string, HTMLElement>>(new Map());
  const lastNotifiedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!onVisibleMonthChange) return;
    // Header (h-16) + toolbar (~46px) + zone chips (~38px) ≈ 150-180px.
    // Active section flips when its top crosses just below the sticky bar.
    const STICKY_OFFSET = 180;
    const handler = () => {
      let activeMk: string | null = null;
      monthRefs.current.forEach((el, mk) => {
        const r = el.getBoundingClientRect();
        if (r.top <= STICKY_OFFSET && r.bottom > STICKY_OFFSET) activeMk = mk;
      });
      // Fallback: if nothing is straddling the line (e.g. all sections below
      // viewport during initial render), pick the first section visible.
      if (!activeMk) {
        let topMostMk: string | null = null;
        let topMostTop = Infinity;
        monthRefs.current.forEach((el, mk) => {
          const t = el.getBoundingClientRect().top;
          if (t > 0 && t < topMostTop) { topMostTop = t; topMostMk = mk; }
        });
        activeMk = topMostMk;
      }
      if (activeMk && activeMk !== lastNotifiedRef.current) {
        lastNotifiedRef.current = activeMk;
        onVisibleMonthChange(activeMk);
      }
    };
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [onVisibleMonthChange, anchor]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(showZoneChips || toolbarRight) && (
        <div className="flex items-center gap-2 flex-wrap">
          {showZoneChips && (
            <>
              <button type="button" onClick={() => setSelectedZone("all")}
                className={`px-3 h-8 rounded-lg text-xs font-semibold border transition-all ${selectedZone === "all" ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200"}`}
                style={{ minHeight: 0 }}>All</button>
              {zones.map((z) => {
                const active = selectedZone === z.name;
                return (
                  <button key={z.id} type="button" onClick={() => setSelectedZone(z.name)}
                    className="px-3 h-8 rounded-lg text-xs font-semibold border transition-all inline-flex items-center gap-1.5"
                    style={{
                      minHeight: 0,
                      backgroundColor: active && z.color ? z.color : "white",
                      borderColor: z.color || "#e5e7eb",
                      color: active ? "white" : (z.color || "#4b5563"),
                    }}>
                    {!active && z.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: z.color }} />}
                    {z.name}
                  </button>
                );
              })}
            </>
          )}
          {toolbarRight && <div className="ml-auto">{toolbarRight}</div>}
        </div>
      )}
      {!hideNav && (
        <div className="flex items-center gap-2">
          <button type="button" onClick={goPrev} className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center" title="เดือนก่อน">
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button type="button" onClick={goNext} className="w-8 h-8 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 flex items-center justify-center" title="เดือนถัดไป">
            <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
          <button type="button" onClick={() => {
            const a = new Date(today.getFullYear(), today.getMonth() - initBack, 1);
            setAnchor({ y: a.getFullYear(), m: a.getMonth() });
          }} className="h-8 px-3 rounded-lg border border-gray-200 bg-white text-xs font-semibold hover:bg-gray-50">วันนี้</button>
        </div>
      )}
      {Object.entries(byMonth).map(([mk, daysInMonth]) => (
        <div key={mk} ref={(el) => { if (el) monthRefs.current.set(mk, el); else monthRefs.current.delete(mk); }} data-month={mk}>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-1">
            {new Date(mk + "-15T12:00:00").toLocaleDateString("th-TH", { month: "long", year: "numeric" })}
          </div>
          <div className="space-y-1">
            {daysInMonth.map((dk) => {
              const d = new Date(dk + "T12:00:00");
              const weekday = d.toLocaleDateString("th-TH", { weekday: "short" });
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              const jobs = byDate[dk] || [];
              const isToday = dk === todayKey;
              return (
                <div key={dk} id={`day-${dk}`} className={`rounded-xl border p-3 scroll-mt-44 ${isToday ? "border-primary bg-primary/5" : jobs.length > 0 ? "border-gray-200 bg-white" : "border-transparent"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-10 text-center shrink-0 ${isToday ? "text-primary" : isWeekend ? "text-red-500" : "text-gray-500"}`}>
                      <div className="text-[10px] font-semibold uppercase">{weekday}</div>
                      <div className={`text-lg font-bold ${isToday ? "text-primary" : jobs.length > 0 ? (isWeekend ? "text-red-500" : "text-gray-900") : (isWeekend ? "text-red-300" : "text-gray-400")}`}>{d.getDate()}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      {jobs.length === 0 && !isToday ? null : jobs.length === 0 ? (
                        <div className="text-xs text-gray-400 py-1">ไม่มีนัดหมาย</div>
                      ) : (
                        <div className="space-y-1">
                          {jobs.map((j) => {
                            const isBlock = j.event_type === "block";
                            const label = STATUS_LABEL(j);
                            // Bar color comes from the lead's zone (block → gray fallback).
                            const barColor = isBlock ? null : (j.zone ? zoneColor[j.zone] : null);
                            const bg = isBlock ? "bg-gray-100" : "bg-gray-50 hover:bg-gray-100";
                            const inner = (
                              <>
                                <div
                                  className={`w-1.5 h-6 rounded-full shrink-0 ${barColor ? "" : "bg-gray-400"}`}
                                  style={barColor ? { backgroundColor: barColor } : undefined}
                                />
                                <EventIcon type={j.event_type} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-semibold text-gray-900 truncate">{j.house_number ? `${j.house_number} - ${j.full_name}` : j.full_name}</div>
                                  <div className="text-[10px] text-gray-500">
                                    {formatSlotsRange(j.time_slot) || (isBlock ? "ทั้งวัน" : "")}{j.time_slot || isBlock ? " · " : ""}{label}{j.zone ? ` · ${j.zone}` : ""}
                                  </div>
                                </div>
                              </>
                            );
                            return isBlock ? (
                              <div key={`block-${j.id}`} className={`flex items-center gap-2 p-2 rounded-lg ${bg}`}>{inner}</div>
                            ) : (
                              <Link key={`${j.event_type}-${j.id}`} href={`/leads/${j.id}`} className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${bg}`}>{inner}</Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
