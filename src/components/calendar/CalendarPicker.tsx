"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { HOURLY_SLOTS, formatSlotsRange, parseSlots, serializeSlots, slotLabel } from "@/lib/time-slots";
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
  /** "shared" = ตัวเลือกวันนัด O&M (ทีมเดียวกับทีมสำรวจ · แผน 20261001-01 เฟส 3) — เห็นนัดทุกทีม (สำรวจ/ติดตั้ง/O&M)
   *  ล็อกช่องที่ทีมมีนัด O&M / สำรวจแล้ว + ปิดช่อง (block) · ติดตั้ง (คนละทีม) เป็นจุด ไม่ล็อก
   *  ★ 21 ต.ค. 69 ผู้ใช้เปลี่ยนเป็น "นัดทับเวลาไม่ได้" (เดิมโหมด warn นัดทับได้แค่เตือน · แผน 20261021-02)
   *  ค่าเริ่มต้น "block" = แบบเดิมของฝั่งขาย (นัดทีมเดียวกันล็อก · งาน O&M เป็นจุด) */
  overlap?: "block" | "shared";
  /** เลื่อนนัดใบงาน O&M — ไม่นับใบตัวเองเป็นนัดทับ */
  excludeOmBookingId?: number | null;
  /** วันไกลสุดที่เลือกได้ (YYYY-MM-DD) — เกินนี้กดไม่ได้ */
  maxDate?: string;
  /** ช่องที่กดไม่ได้เพิ่มเติม เช่น ช่วงที่เริ่มไปแล้วของวันนี้ */
  slotDisabled?: (date: string, slot: string) => boolean;
  /** โครงการของบ้านที่กำลังนัด (รหัส REM แบบ om_houses.project_id · แผน 20261021-02) — ใช้กับ overlap="shared"
   *  มีรหัส = แถบชิปวันที่ทีมเข้าโครงการนี้อยู่แล้ว + วงกรอบวัน + ช่องโครงการเดียวกัน (พื้นเขียว + บ้านเลขที่)
   *  ไม่มีรหัส (บ้านนอกโครงการ) = ไม่มีส่วนโครงการ — ตัวนับช่องว่าง + รายการนัดของวันยังขึ้นตามโหมด shared */
  sameProject?: { id: string | null; name: string | null } | null;
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
// ทีมสำรวจกับทีมล้างเป็นชุดเดียวกัน (แผน 20261001-01) — นัดสองแบบนี้หักช่องว่าง และนับว่า "ทีมเข้าโครงการแล้ว"
//   ติดตั้งเป็นคนละทีม (จองทั้งวัน) ไม่หัก/ไม่นับ — ผู้ใช้เคาะ 21 ต.ค. 69 (แผน 20261021-02 ข้อ 1)
const SAME_TEAM = ["om", "survey"];
type Info = {
  kind: string; label: string; slots: string[] | null;   // slots null = ทั้งวัน
  /** อยู่โครงการเดียวกับบ้านที่กำลังนัด (เฉพาะ SAME_TEAM) */
  same: boolean; project: string | null; service: string | null;
};
const thShortDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short" });

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
  sameProject,
}: Props) {
  const rangeMode = !!onDateEndChange;
  void zoneFilter;
  const [surveys, setSurveys] = useState<{ id: number; event_date?: string; time_slot?: string | null; event_type?: string; survey_date?: string; survey_time_slot?: string | null; zone?: string | null; team?: string | null; house_number?: string | null; full_name?: string | null; rem_project_id?: string | null; project_name?: string | null; om_service?: string | null }[]>([]);
  const shared = overlap === "shared";
  const pjId = shared ? sameProject?.id ?? null : null;
  // งาน O&M ล็อกช่องแล้ว (นัดทับเวลาไม่ได้) — ตัวเลือกวันนัด O&M + นัดสำรวจฝั่งขาย · ติดตั้งยังนัดทับได้
  const omLocked = shared || teamContext === "survey";

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

  // นัดที่แสดงเป็นจุดบนวัน/ช่วงเวลา (แผน 20261001-01)
  //   โหมดปกติ (ฝั่งขาย) = งาน O&M อย่างเดียว (นัดทีมเดียวกันล็อกอยู่แล้ว) · โหมด shared (O&M) = นัดทุกทีม
  //   ติดตั้งไม่มีช่วงเวลา = ทั้งวัน
  const infoByDate = useMemo(() => {
    const kinds = overlap === "shared" ? ["survey", "install", "om"] : ["om"];
    const m: Record<string, Info[]> = {};
    for (const s of surveys) {
      const kind = s.event_type ?? "";
      if (!kinds.includes(kind) || !s.event_date) continue;
      const slots = kind === "install" ? [] : parseSlots(s.time_slot ?? null);
      (m[s.event_date.slice(0, 10)] ??= []).push({
        kind, label: houseNumberOrNull(s.house_number ?? null) ?? s.full_name ?? "", slots: slots.length ? slots : null,
        same: !!pjId && SAME_TEAM.includes(kind) && s.rem_project_id === pjId,
        project: s.project_name ?? null, service: kind === "om" ? s.om_service ?? null : null,
      });
    }
    return m;
  }, [surveys, overlap, pjId]);
  const at = (i: Info, slot: string) => !i.slots || i.slots.includes(slot);
  // จุดสีทีมบนวัน/ช่อง · otherOnly = ไม่นับนัดโครงการเดียวกัน (ช่องนั้นขึ้นเป็นพื้นเขียว + บ้านเลขที่แทน)
  const kindsAt = (iso: string, slot?: string, otherOnly = false) =>
    [...new Set((infoByDate[iso] ?? []).filter(i => (!slot || at(i, slot)) && !(otherOnly && i.same)).map(i => i.kind))];
  const infoTitle = (iso: string) => {
    const list = infoByDate[iso];
    if (!list?.length) return undefined;
    const n = (k: string) => list.filter(i => i.kind === k).length;
    const same = list.filter(i => i.same).length;
    return `${same ? `${sameProject?.name ?? "โครงการนี้"} ${same} นัด · ` : ""}มีนัด ${kindsAt(iso).map(k => `${INFO_LABEL[k]} ${n(k)}`).join(" · ")}${omLocked ? "" : " (นัดทับได้)"}`;
  };

  // Team-scoped events. Block events with team=null apply to both teams.
  // โหมด shared: ที่นี่เหลือปิดช่อง (block) ของทีมนี้/ทุกทีม — นัด O&M / สำรวจล็อกที่ระดับช่องด้วย teamAt ข้างล่าง
  //   (ไม่ระบายสีวันที่มีนัดทั้งวันแบบฝั่งขาย — ใช้จุด + วงกรอบโครงการ)
  // ★ 21 ต.ค. 69 ฝั่งขายนัดสำรวจ: งาน O&M ล็อกช่องด้วย (ทีมสำรวจ = ทีมล้าง · ผู้ใช้เคาะ "ล็อก" แผน 20261021-02 รอบ 3)
  //   เดิมเห็นเป็นจุดแต่นัดทับได้ · ปฏิทินติดตั้งยังเห็นงาน O&M เป็นจุดเหมือนเดิม (คนละทีม)
  const teamEvents = useMemo(() => surveys.filter(s => {
    if (s.event_type === "block") return s.team == null || s.team === teamContext;
    if (overlap === "shared") return false;
    return s.team === teamContext || (teamContext === "survey" && s.event_type === "om");
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

  // ★ 21 ต.ค. 69 โหมด shared: "นัดทับเวลาไม่ได้" (ผู้ใช้เปลี่ยนกติกา · แผน 20261021-02) — ทีมมีชุดเดียว
  //   ช่องที่มีนัด O&M / สำรวจ (ทุกโครงการ) = ล็อก · ติดตั้งคนละทีม ไม่ล็อก
  const teamAt = (iso: string, s: string) => (infoByDate[iso] ?? []).filter(i => SAME_TEAM.includes(i.kind) && at(i, s));
  const unavailable = (iso: string, s: string) => !!bookedSlotsByDate[iso]?.has(s) || (shared && teamAt(iso, s).length > 0);

  // เลือกวัน (คลิกในปฏิทิน / ชิปโครงการ) — ตัดช่องที่เลือกไว้ซึ่งวันใหม่ปิดอยู่/ทีมติดนัดออก
  const pickDate = (iso: string) => {
    onDateChange(iso);
    if (selectedSlots.length > 0) {
      const remaining = selectedSlots.filter(s => !unavailable(iso, s));
      if (remaining.length !== selectedSlots.length) onTimeSlotChange(serializeSlots(remaining) || "");
    }
  };

  // ข้อมูลนัดมาถึงหลังเลือกช่องไปแล้ว (หรือช่องเดิมของใบที่เลื่อนมีนัดอื่นทับอยู่) — ตัดช่องที่ทีมติดนัดออก ไม่ให้บันทึกทับ
  useEffect(() => {
    if (!shared || !date) return;
    const picked = parseSlots(timeSlot);
    const busy = (infoByDate[date] ?? []).filter(i => SAME_TEAM.includes(i.kind));
    const remaining = picked.filter(s => !busy.some(i => !i.slots || i.slots.includes(s)));
    if (remaining.length !== picked.length) onTimeSlotChange(serializeSlots(remaining) || "");
  }, [shared, date, timeSlot, infoByDate, onTimeSlotChange]);

  // ── แผน 20261021-02 (โหมด shared): ช่องว่าง · วันที่ทีมเข้าโครงการเดียวกันอยู่แล้ว ──
  //   (ป้าย "ต่อคิว" บนช่องว่างที่ติดนัดโครงการเดียวกัน — ผู้ใช้สั่งเอาออก 21 ต.ค. 69)
  // ช่องว่าง = ไม่มีนัด O&M / สำรวจของโครงการไหนเลย · ไม่ถูกปิด · ไม่เลยเวลา
  const isFree = (iso: string, s: string) => !unavailable(iso, s) && !slotDisabled?.(iso, s);
  const freeCount = (iso: string) => HOURLY_SLOTS.filter(s => isFree(iso, s)).length;
  // ไม่เหลือช่องให้เลือกทั้งวัน (ปิดช่อง/ทีมติดนัดครบ) = เลือกวันนั้นไม่ได้ — ไม่ขึ้นเป็นชิป
  const dayLocked = (iso: string) => !!bookedSlotsByDate[iso]?.has("FULL") || HOURLY_SLOTS.every(h => unavailable(iso, h));
  const todayIso = new Date().toLocaleDateString("sv-SE");
  // ชิปวันที่ทีมเข้าโครงการนี้อยู่แล้ว — เฉพาะวันที่ยังมีช่องว่าง เรียงใกล้สุด ไม่เกิน 5 วัน
  const projectDays = pjId && !rangeMode
    ? Object.keys(infoByDate)
        .filter(iso => iso >= todayIso && (!maxDate || iso <= maxDate) && !dayLocked(iso) && freeCount(iso) > 0
          && infoByDate[iso].some(i => i.same))
        .sort().slice(0, 5)
    : [];

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
      {/* ① วันที่ทีมเข้าโครงการเดียวกันอยู่แล้ว (แผน 20261021-02) — กดชิป = เลือกวันนั้น · ไม่มีนัดในโครงการ = ไม่แสดง
          มือถือ: ชิปเลื่อนแนวนอนแถวเดียว */}
      {projectDays.length > 0 && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 flex flex-col md:flex-row md:items-center gap-1.5 md:gap-3">
          <div className="text-xs text-emerald-700 flex items-center gap-1 min-w-0">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            <span className="md:truncate">ทีมเข้า <b className="font-semibold">{sameProject?.name ?? "โครงการนี้"}</b> อยู่แล้ว</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto md:flex-wrap -mx-1 px-1 pb-0.5 md:pb-0">
            {projectDays.map(iso => {
              const same = infoByDate[iso].filter(i => i.same);
              const on = date === iso;
              return (
                <button key={iso} type="button" onClick={() => pickDate(iso)} style={{ minHeight: 0 }}
                  title={same.map(i => `${INFO_LABEL[i.kind]} ${i.label} ${i.slots ? formatSlotsRange(JSON.stringify(i.slots)) : "ทั้งวัน"}`).join(" · ")}
                  className={`shrink-0 h-7 px-2.5 rounded-md border text-xs inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                    on ? "bg-active border-active text-white" : "bg-white border-emerald-300 text-gray-700 hover:border-emerald-500"}`}>
                  <b className={`font-semibold ${on ? "" : "text-gray-900"}`}>{thShortDay(iso)}</b>
                  <span className="opacity-40">·</span>
                  {same.length > 1 ? <span>{same.length} นัด</span> : (
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: on ? "#fff" : INFO_COLOR[same[0].kind] }} />
                      {same[0].label} <span className="font-mono tabular-nums">{same[0].slots?.[0] ?? "ทั้งวัน"}</span>
                    </span>
                  )}
                  <span className="opacity-40">·</span>
                  <span className={on ? "" : "text-emerald-700 font-medium"}>ว่าง {freeCount(iso)} ช่วงเวลา</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

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
                  // โหมด shared: ทีมติดนัดครบทุกช่อง (นัดทับเวลาไม่ได้ · 21 ต.ค. 69) = วันนั้นเลือกไม่ได้
                  const teamFull = shared && !pastBlocks && !isFull && dayLocked(iso);
                  const disabled = pastBlocks || teamFull || (showSurveySlots && (isFull || (fullDayEvent && isPartial)));
                  // ② วันที่ทีมเข้าโครงการเดียวกันอยู่แล้ว = วงกรอบเขียว (แผน 20261021-02) — รูปทรงต่างจากจุดสีทีม
                  const sameDay = !!pjId && !pastBlocks && !teamFull && !!infoByDate[iso]?.some(i => i.same);
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
                          // Drop any previously selected slots that are taken on the new date.
                          pickDate(iso);
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
                            : teamFull
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : bookedClass || bookedStyle
                            ? `${bookedClass}${isFull ? " cursor-not-allowed" : " hover:brightness-95"}`
                            : sameDay
                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : isToday
                            ? "bg-active-light text-active ring-1 ring-active/30 hover:bg-active hover:text-white"
                            : isPast
                            ? "text-gray-500 hover:bg-active-light hover:text-active"
                            : `${isWeekend ? "text-red-500" : "text-gray-700"} hover:bg-active-light hover:text-active`
                        }${sameDay ? ` ring-2 ring-emerald-500${selected ? " ring-offset-1" : ""}` : ""}`}
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
          <div className="flex items-baseline text-xs font-semibold tracking-wider uppercase text-gray-400 mb-2">
            <span>ช่วงเวลา {required && <span className="text-red-500">*</span>}</span>
            <span className="ml-2 text-gray-300 normal-case font-normal">เลือกได้มากกว่า 1 ช่วง</span>
            {/* ③ ตัวนับช่องว่างของวันที่เลือก (โหมด shared · แผน 20261021-02) */}
            {shared && date && (
              <span className="ml-auto normal-case tracking-normal font-normal text-gray-500">
                ว่าง <b className="font-medium text-emerald-700 tabular-nums">{freeCount(date)}</b> / {HOURLY_SLOTS.length} ช่อง
              </span>
            )}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {HOURLY_SLOTS.map(s => {
              const selected = selectedSlots.includes(s);
              const dayBooked = date && showSurveySlots ? bookedSlotsByDate[date] : null;
              // ปิดช่อง / ช่องที่คนเรียกปิดเพิ่ม (เช่น เลยเวลาแล้ว) — ช่องที่เลือกอยู่ยังกดเอาออกได้
              const blocked = (!!dayBooked && dayBooked.has(s) && !selected)
                || (!!date && !selected && !!slotDisabled?.(date, s));
              // โหมด shared: ทีมมีนัด O&M / สำรวจช่วงนี้แล้ว = ล็อก (นัดทับเวลาไม่ได้ · 21 ต.ค. 69)
              const team = date && shared && !blocked ? teamAt(date, s) : [];
              const taken = blocked || (team.length > 0 && !selected);
              // ③ โครงการเดียวกัน = พื้นเขียว + บ้านเลขที่ (ล็อก · แผน 20261021-02)
              //   มือถือช่องแคบ: ไม่มีคำ เหลือจุดเขียว — บ้านเลขที่ดูในรายการนัดข้างล่าง
              const same = team.filter(i => i.same);
              const kinds = date && !blocked ? kindsAt(date, s, true) : [];
              const tip = same.length
                ? `ทีมติดนัดโครงการเดียวกัน: ${same.map(i => i.label).join(", ")} — นัดทับเวลาไม่ได้`
                : team.length ? `ทีมติดนัด ${team.map(i => `${INFO_LABEL[i.kind]} ${i.label}`).join(", ")} — นัดทับเวลาไม่ได้`
                : kinds.length ? `ช่วงนี้มีนัด ${kinds.map(k => INFO_LABEL[k]).join(" · ")}${shared ? " (คนละทีม)" : " — นัดทับได้"}` : undefined;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={taken}
                  title={tip}
                  onClick={() => {
                    const next = selected
                      ? selectedSlots.filter(x => x !== s)
                      : [...selectedSlots, s].sort();
                    onTimeSlotChange(serializeSlots(next) || "");
                  }}
                  className={`min-w-0 flex items-center justify-center gap-1 h-8 px-1 rounded-md border transition-all ${
                    selected
                      ? "bg-active border-active text-white shadow-sm shadow-active/20"
                      : same.length
                      ? "bg-emerald-50 border-emerald-200 text-gray-500 cursor-not-allowed"
                      : taken
                      ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-white border-gray-300 text-gray-900 hover:border-active hover:text-active"
                  }`}
                >
                  <span className="text-[11px] md:text-xxs font-semibold font-mono tabular-nums">{slotLabel(s)}</span>
                  {same.length > 0 && <>
                    <span className={`hidden md:inline truncate text-xxs font-medium ${selected ? "text-white/85" : "text-emerald-700"}`}>
                      ▪ {same.map(i => i.label).join(", ")}
                    </span>
                    <span className="md:hidden w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: selected ? "#fff" : "#10b981" }} />
                  </>}
                  {kinds.map(k => (
                    <span key={k} className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: selected ? "#fff" : INFO_COLOR[k] }} />
                  ))}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ④ โหมด shared (O&M · แผน 20261021-02): รายการนัดของวันที่เลือก
          เวลา · ประเภท · บ้าน · โครงการ — โครงการเดียวกันขึ้นก่อน แล้วตามเวลา · ทั้งวัน (ติดตั้ง) ท้ายสุด */}
      {shared && date && infoOn.length > 0 && showTimeSlot && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
          <div className="px-3 py-1.5 text-xxs text-gray-500">วันที่เลือกมีนัด {infoOn.length} นัด</div>
          {[...infoOn]
            .sort((a, b) => Number(b.same) - Number(a.same) || (a.slots?.[0] ?? "99").localeCompare(b.slots?.[0] ?? "99"))
            .map((i, n) => (
              <div key={n} className="px-3 py-1.5 flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-0.5 text-xs">
                <span className="min-w-[6.5rem] shrink-0 font-mono tabular-nums font-medium text-gray-900">
                  {i.slots ? formatSlotsRange(JSON.stringify(i.slots)) : "ทั้งวัน"}
                </span>
                <span className="inline-flex items-center gap-1 shrink-0 text-gray-600">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: INFO_COLOR[i.kind] }} />
                  {INFO_LABEL[i.kind]}{i.service ? ` ${i.service}` : ""}
                </span>
                <span className="font-medium text-gray-900">{i.label}</span>
                {/* ป้ายติดบ้านเลขที่ — จอกว้างไม่ต้องกวาดตาไปขวาสุด */}
                {i.same && <span className="shrink-0 px-2 rounded-full bg-emerald-100 text-emerald-700 text-xxs font-semibold leading-5">โครงการเดียวกัน</span>}
                <span className="basis-full md:basis-auto md:flex-1 min-w-0 truncate text-gray-500">{i.project ?? ""}</span>
              </div>
            ))}
        </div>
      )}
      {/* ฝั่งขาย (โหมด block): นัด O&M ของวันที่เลือก — บอกความหมายของจุด/ช่องเทา
          ★ 1 ต.ค. 69 ผู้ใช้สั่งเอาแถบเตือนเหลือง "⚠ ทับนัด …" ออก — เหลือจุด + บรรทัดนี้
          ★ 21 ต.ค. 69 นัดสำรวจ: ช่องงาน O&M ล็อกแล้ว (ไม่มีจุด เป็นช่องเทา) · ติดตั้งยังเห็นเป็นจุด นัดทับได้ */}
      {!shared && date && infoOn.length > 0 && showTimeSlot && (
        <div className="mt-1.5 flex items-center gap-x-2 gap-y-0.5 flex-wrap text-xxs text-gray-500">
          <span>วันที่เลือกมีนัด</span>
          {kindsAt(date).map(k => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: INFO_COLOR[k] }} />
              {INFO_LABEL[k]} {infoOn.filter(i => i.kind === k).length}
            </span>
          ))}
          <span>{omLocked ? "— ช่องสีเทาคือช่วงที่ทีมติดนัด เลือกไม่ได้" : "— จุดคือช่วงที่ติดนัด · ยังนัดทับได้"}</span>
        </div>
      )}
    </div>
  );
}
