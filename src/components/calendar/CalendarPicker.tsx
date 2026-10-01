"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { HOURLY_SLOTS, parseSlots, serializeSlots, slotLabel } from "@/lib/time-slots";
import { houseNumberOrNull } from "@/lib/utils/name";
import { OM_EVENT_COLOR } from "./OmEvent";

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

interface Props {
  date: string;
  timeSlot: string;
  onDateChange: (date: string) => void;
  onTimeSlotChange: (slot: string) => void;
  showTimeSlot?: boolean;
  showSurveySlots?: boolean;
  excludeLeadId?: number;
  required?: boolean;
  /** Legacy — no longer drives availability or colour. Kept so older callers
   * still compile. */
  zoneFilter?: string | null;
  /** Which team's calendar this picker represents. Drives availability:
   *   "survey" → blocks survey events + survey-or-shared blocks
   *   "install" → blocks install events + install-or-shared blocks
   * Required for showSurveySlots; defaults to "survey". */
  teamContext?: "survey" | "install";
  /** Allow clicking dates in the past (e.g. back-dating an activity log).
   * Default false — future appointments shouldn't be back-dated. When true,
   * also shifts the visible window to show the previous month + current month
   * so the user can reach last month without month navigation. */
  allowPast?: boolean;
  /** Optional end date — when both this and `onDateEndChange` are provided
   * the picker becomes a range selector: 1st click = start, 2nd click = end,
   * 3rd click = reset to new start. Click on start clears the range. */
  dateEnd?: string;
  onDateEndChange?: (d: string) => void;
  /** "warn" = เห็นนัดทุกทีม (สำรวจ/ติดตั้ง/O&M) เป็นจุด แต่ไม่ล็อก — ล็อกเฉพาะปิดช่อง (block)
   *  ใช้กับงาน O&M ที่ทีมเดียวกับสำรวจ แต่ผู้ใช้เคาะให้นัดทับได้ (แผน 20261001-01 เฟส 3)
   *  ค่าเริ่มต้น "block" = แบบเดิมของฝั่งขาย (นัดทีมเดียวกันล็อก · งาน O&M เป็นจุด) */
  overlap?: "block" | "warn";
  /** เลื่อนนัดใบงาน O&M — ไม่นับใบตัวเองเป็นนัดทับ */
  excludeOmBookingId?: number | null;
  /** วันไกลสุดที่เลือกได้ (YYYY-MM-DD) — เกินนี้กดไม่ได้ */
  maxDate?: string;
  /** ช่องที่กดไม่ได้เพิ่มเติม เช่น ช่วงที่เริ่มไปแล้วของวันนี้ */
  slotDisabled?: (date: string, slot: string) => boolean;
}

// Team colours mirror the calendar page legend so the picker reads the same
// regardless of where it's opened.
const TEAM_COLOR: Record<string, string> = {
  survey: "#8b5cf6",
  install: "#f97316",
};
// นัดที่ "เห็นแต่ไม่ล็อก" (จุดบนวัน/ช่วงเวลา) — สีตรง legend หน้า /calendar
const INFO_COLOR: Record<string, string> = { ...TEAM_COLOR, om: OM_EVENT_COLOR };
const INFO_LABEL: Record<string, string> = { survey: "สำรวจ", install: "ติดตั้ง", om: "O&M" };
type Info = { kind: string; label: string; slots: string[] | null };   // slots null = ทั้งวัน

export default function CalendarPicker({
  date,
  timeSlot,
  onDateChange,
  onTimeSlotChange,
  showTimeSlot = true,
  showSurveySlots = false,
  excludeLeadId,
  required = false,
  zoneFilter,
  teamContext = "survey",
  allowPast = false,
  dateEnd,
  onDateEndChange,
  overlap = "block",
  excludeOmBookingId,
  maxDate,
  slotDisabled,
}: Props) {
  const rangeMode = !!onDateEndChange;
  void zoneFilter;
  const [surveys, setSurveys] = useState<{ id: number; event_date?: string; time_slot?: string | null; event_type?: string; survey_date?: string; survey_time_slot?: string | null; zone?: string | null; team?: string | null; house_number?: string | null; full_name?: string | null }[]>([]);

  useEffect(() => {
    if (!showSurveySlots) return;
    apiFetch("/api/surveys/scheduled")
      // ตัดนัดของตัวเอง — lead ตัดเฉพาะแถว lead · ใบงาน O&M ตัดเฉพาะแถว O&M
      //   (id ของงาน O&M = เลขใบงาน อาจตรงกับเลข lead — แผน 20261001-01)
      .then((data: { id: number; event_type?: string }[]) => setSurveys(data.filter(s =>
        !(excludeLeadId && s.id === excludeLeadId && s.event_type !== "om")
        && !(excludeOmBookingId && s.id === excludeOmBookingId && s.event_type === "om"))))
      .catch(console.error);
  }, [showSurveySlots, excludeLeadId, excludeOmBookingId]);

  // นัดที่ "เห็นแต่ไม่ล็อก" (แผน 20261001-01) — จุดบนวัน/ช่วงเวลา + เตือนเมื่อเลือกทับ
  //   โหมดปกติ (ฝั่งขาย) = งาน O&M อย่างเดียว (นัดทีมเดียวกันล็อกอยู่แล้ว) · โหมด warn (O&M) = นัดทุกทีม
  //   ติดตั้งไม่มีช่วงเวลา = ทั้งวัน
  const infoByDate = useMemo(() => {
    const kinds = overlap === "warn" ? ["survey", "install", "om"] : ["om"];
    const m: Record<string, Info[]> = {};
    for (const s of surveys) {
      const kind = s.event_type ?? "";
      if (!kinds.includes(kind) || !s.event_date) continue;
      const slots = kind === "install" ? [] : parseSlots(s.time_slot ?? null);
      (m[s.event_date.slice(0, 10)] ??= []).push({
        kind, label: houseNumberOrNull(s.house_number ?? null) ?? s.full_name ?? "", slots: slots.length ? slots : null,
      });
    }
    return m;
  }, [surveys, overlap]);
  const kindsAt = (iso: string, slot?: string) =>
    [...new Set((infoByDate[iso] ?? []).filter(i => !slot || !i.slots || i.slots.includes(slot)).map(i => i.kind))];
  const infoTitle = (iso: string) => {
    const list = infoByDate[iso];
    if (!list?.length) return undefined;
    const n = (k: string) => list.filter(i => i.kind === k).length;
    return `มีนัด ${kindsAt(iso).map(k => `${INFO_LABEL[k]} ${n(k)}`).join(" · ")} (นัดทับได้)`;
  };

  // Team-scoped events. Block events with team=null apply to both teams.
  // โหมด warn: นัดไม่ล็อก — ล็อกเฉพาะปิดช่อง (block) ของทีมนี้/ทุกทีม
  const teamEvents = useMemo(() => surveys.filter(s => {
    if (s.event_type === "block") return s.team == null || s.team === teamContext;
    if (overlap === "warn") return false;
    return s.team === teamContext;
  }), [surveys, teamContext, overlap]);

  // Same-day tint. Real bookings (survey/install) take the team colour, while
  // manual blocks (admin "ทีมไปทำอย่างอื่น") show as neutral gray — they
  // aren't actual jobs, just unavailability.
  const dayColor = TEAM_COLOR[teamContext] ?? "#8b5cf6";
  const BLOCK_GRAY = "#9ca3af";
  const zoneByDate = useMemo(() => {
    // Per date: prefer the team colour if any same-team booking exists;
    // fall back to gray when only blocks are present.
    const m: Record<string, string> = {};
    for (const s of teamEvents) {
      const dateRaw = s.event_date || s.survey_date;
      if (!dateRaw) continue;
      const key = dateRaw.slice(0, 10);
      const isBlock = s.event_type === "block";
      if (m[key] === dayColor) continue;
      m[key] = isBlock ? BLOCK_GRAY : dayColor;
    }
    return m;
  }, [teamEvents, dayColor]);
  const zoneColor: Record<string, string> = useMemo(() => ({ [dayColor]: dayColor, [BLOCK_GRAY]: BLOCK_GRAY }), [dayColor]);

  // Per-date set of hourly slots already booked WITHIN THIS TEAM. Install
  // events (no slot) block the entire day. Sentinel "FULL" speeds the
  // day-level check.
  const bookedSlotsByDate = teamEvents.reduce<Record<string, Set<string>>>((acc, s) => {
    const dateRaw = s.event_date || s.survey_date;
    const slot = s.time_slot ?? s.survey_time_slot ?? null;
    if (!dateRaw) return acc;
    const key = dateRaw.slice(0, 10);
    if (!acc[key]) acc[key] = new Set();
    const set = acc[key];
    if (!slot) {
      HOURLY_SLOTS.forEach(h => set.add(h));
      set.add("FULL");
      return acc;
    }
    parseSlots(slot).forEach(h => set.add(h));
    return acc;
  }, {});

  // Currently selected hourly slots for this picker (multi-select).
  const selectedSlots = parseSlots(timeSlot);
  const infoOn = date ? infoByDate[date] ?? [] : [];

  const today = new Date(); today.setHours(0, 0, 0, 0);
  // Back-dating view shifts the window one month earlier so the user can
  // reach last month without month navigation.
  const months = allowPast
    ? [
        new Date(today.getFullYear(), today.getMonth() - 1, 1),
        new Date(today.getFullYear(), today.getMonth(), 1),
        new Date(today.getFullYear(), today.getMonth() + 1, 1),
      ]
    : [
        new Date(today.getFullYear(), today.getMonth(), 1),
        new Date(today.getFullYear(), today.getMonth() + 1, 1),
        new Date(today.getFullYear(), today.getMonth() + 2, 1),
      ];

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:divide-x md:divide-gray-200">
        {months.map((monthStart, monthIdx) => {
          const monthLabel = monthStart.toLocaleDateString("th-TH", { month: "long" });
          const firstDayOfWeek = monthStart.getDay();
          const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
          return (
            <div key={monthStart.toISOString()} className={monthIdx > 0 ? "pl-3" : undefined}>
              <div className="text-xs font-semibold text-gray-700 mb-1 text-center">{monthLabel}</div>
              <div className="grid grid-cols-7 mb-0.5">
                {WEEKDAYS.map((w, i) => (
                  <div key={w} className={`text-xs text-center font-semibold py-0.5 ${i === 0 || i === 6 ? "text-red-400" : "text-gray-400"}`}>{w}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`pad-${i}`} className="h-8" />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1);
                  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  const isStart = date === iso;
                  const isEnd = rangeMode && !!dateEnd && dateEnd === iso;
                  const isInRange = rangeMode && !!date && !!dateEnd && iso > date && iso < dateEnd;
                  const selected = isStart || isEnd;
                  const isPast = d < today;
                  const isToday = d.getTime() === today.getTime();
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const booked = bookedSlotsByDate[iso];
                  const bookedCount = booked ? Array.from(booked).filter(s => s !== "FULL").length : 0;
                  const isFull = !!booked && (booked.has("FULL") || bookedCount >= HOURLY_SLOTS.length);
                  const isPartial = !!booked && bookedCount > 0 && !isFull;
                  // Full-day picker (install) — any prior booking blocks the day.
                  const fullDayEvent = !showTimeSlot;
                  // ไกลเกิน maxDate (เช่น ระยะนัดล่วงหน้าของ O&M) กดไม่ได้ หน้าตาแบบวันที่ผ่านแล้ว
                  const pastBlocks = (isPast && !allowPast) || (!!maxDate && iso > maxDate);
                  const disabled = pastBlocks || (showSurveySlots && (isFull || (fullDayEvent && isPartial)));
                  // Tint booked cells by the zone of the first booking on
                  // that date. Falls back to neutral red/amber when the zone
                  // has no colour configured.
                  const zoneName = zoneByDate[iso];
                  const zc = zoneName ? zoneColor[zoneName] : null;
                  let bookedClass = "";
                  let bookedStyle: React.CSSProperties | undefined;
                  if (!isPast && !selected && showSurveySlots) {
                    if (isFull || (fullDayEvent && isPartial)) {
                      if (zc) bookedStyle = { backgroundColor: `${zc}33`, color: zc };
                      else bookedClass = "bg-red-100 text-red-500";
                    } else if (isPartial) {
                      if (zc) bookedStyle = { backgroundColor: `${zc}1f`, color: zc };
                      else bookedClass = "bg-amber-100 text-amber-700";
                    }
                  }
                  return (
                    <div key={iso} className="h-8 flex items-center justify-center">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          if (rangeMode) {
                            // Range cycle: empty → start; start only + click later → end;
                            // start + end → reset start to clicked, clear end;
                            // click on existing start → clear both.
                            if (!date) {
                              onDateChange(iso);
                              onDateEndChange!("");
                            } else if (iso === date) {
                              onDateChange("");
                              onDateEndChange!("");
                            } else if (!dateEnd && iso > date) {
                              onDateEndChange!(iso);
                            } else {
                              onDateChange(iso);
                              onDateEndChange!("");
                            }
                            return;
                          }
                          onDateChange(iso);
                          // Drop any previously selected slots that are taken on the new date.
                          const taken = bookedSlotsByDate[iso];
                          if (taken && selectedSlots.length > 0) {
                            const remaining = selectedSlots.filter(s => !taken.has(s));
                            if (remaining.length !== selectedSlots.length) {
                              onTimeSlotChange(serializeSlots(remaining) || "");
                            }
                          }
                        }}
                        onDoubleClick={(e) => {
                          // Double-click the currently selected day to clear
                          // the picker — there's no other way to undo a pick
                          // once one is committed.
                          if (selected) {
                            e.preventDefault();
                            onDateChange("");
                            if (rangeMode) onDateEndChange!("");
                            onTimeSlotChange("");
                          }
                        }}
                        style={bookedStyle ? { minHeight: 0, ...bookedStyle } : { minHeight: 0 }}
                        title={infoTitle(iso)}
                        className={`relative w-8 h-8 rounded-full flex items-center justify-center text-sm leading-none font-semibold transition-all ${
                          selected
                            ? "bg-active text-white shadow-sm shadow-active/30"
                            : isInRange
                            ? "bg-active/20 text-active hover:bg-active/30"
                            : pastBlocks
                            ? "text-gray-300 cursor-not-allowed"
                            : bookedClass || bookedStyle
                            ? `${bookedClass}${isFull ? " cursor-not-allowed" : " hover:brightness-95"}`
                            : isToday
                            ? "bg-active-light text-active ring-1 ring-active/30 hover:bg-active hover:text-white"
                            : isPast
                            ? "text-gray-500 hover:bg-active-light hover:text-active"
                            : `${isWeekend ? "text-red-500" : "text-gray-700"} hover:bg-active-light hover:text-active`
                        }`}
                      >
                        {d.getDate()}
                        {/* วันที่มีนัดแบบเห็นแต่ไม่ล็อก — จุดเล็กใต้เลข 1 จุดต่อทีม */}
                        {infoByDate[iso] && (
                          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 flex gap-px">
                            {kindsAt(iso).map(k => (
                              <span key={k} className="w-1 h-1 rounded-full" style={{ backgroundColor: selected ? "#fff" : INFO_COLOR[k] }} />
                            ))}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time slot — always visible. Hourly multi-select; saved as JSON array. */}
      {showTimeSlot && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="text-xs font-semibold tracking-wider uppercase text-gray-400 mb-2">
            ช่วงเวลา {required && <span className="text-red-500">*</span>}
            <span className="ml-2 text-gray-300 normal-case font-normal">เลือกได้มากกว่า 1 ช่วง</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {HOURLY_SLOTS.map(s => {
              const selected = selectedSlots.includes(s);
              const dayBooked = date && showSurveySlots ? bookedSlotsByDate[date] : null;
              // ช่องที่คนเรียกปิดเพิ่ม (เช่น เลยเวลาแล้ว) — ช่องที่เลือกอยู่ยังกดเอาออกได้
              const taken = (!!dayBooked && dayBooked.has(s) && !selected)
                || (!!date && !selected && !!slotDisabled?.(date, s));
              const kinds = date && !taken ? kindsAt(date, s) : [];
              return (
                <button
                  key={s}
                  type="button"
                  disabled={taken}
                  title={kinds.length ? `ช่วงนี้มีนัด ${kinds.map(k => INFO_LABEL[k]).join(" · ")} — นัดทับได้` : undefined}
                  onClick={() => {
                    const next = selected
                      ? selectedSlots.filter(x => x !== s)
                      : [...selectedSlots, s].sort();
                    onTimeSlotChange(serializeSlots(next) || "");
                  }}
                  className={`flex items-center justify-center gap-1 h-8 px-1 rounded-md border transition-all ${
                    selected
                      ? "bg-active border-active text-white shadow-sm shadow-active/20"
                      : taken
                      ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-white border-gray-300 text-gray-900 hover:border-active hover:text-active"
                  }`}
                >
                  <span className="text-[11px] md:text-xxs font-semibold font-mono tabular-nums">{slotLabel(s)}</span>
                  {kinds.map(k => (
                    <span key={k} className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: selected ? "#fff" : INFO_COLOR[k] }} />
                  ))}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* นัดของวันที่เลือกที่ "เห็นแต่ไม่ล็อก" — บอกความหมายของจุด
          ★ 1 ต.ค. 69 ผู้ใช้สั่งเอาแถบเตือนเหลือง "⚠ ทับนัด …" ออก — เหลือจุด + บรรทัดนี้ (ยังนัดทับได้) */}
      {date && infoOn.length > 0 && showTimeSlot && (
        <div className="mt-1.5 flex items-center gap-x-2 gap-y-0.5 flex-wrap text-xxs text-gray-500">
          <span>วันที่เลือกมีนัด</span>
          {kindsAt(date).map(k => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: INFO_COLOR[k] }} />
              {INFO_LABEL[k]} {infoOn.filter(i => i.kind === k).length}
            </span>
          ))}
          <span>— จุดคือช่วงที่ติดนัด · ยังนัดทับได้</span>
        </div>
      )}
    </div>
  );
}
