"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { HOURLY_SLOTS, parseSlots, serializeSlots, slotLabel } from "@/lib/time-slots";

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
}

export default function CalendarPicker({
  date,
  timeSlot,
  onDateChange,
  onTimeSlotChange,
  showTimeSlot = true,
  showSurveySlots = false,
  excludeLeadId,
  required = false,
}: Props) {
  const [surveys, setSurveys] = useState<{ id: number; event_date?: string; time_slot?: string | null; event_type?: string; survey_date?: string; survey_time_slot?: string | null }[]>([]);

  useEffect(() => {
    if (!showSurveySlots) return;
    apiFetch("/api/surveys/scheduled")
      .then((data) => setSurveys(excludeLeadId ? data.filter((s: { id: number }) => s.id !== excludeLeadId) : data))
      .catch(console.error);
  }, [showSurveySlots, excludeLeadId]);

  // Per-date set of hourly slots already booked. Install events (no slot)
  // block the entire day, so we mark all hourly codes plus a sentinel "FULL"
  // so the day-level check is cheap.
  const bookedSlotsByDate = surveys.reduce<Record<string, Set<string>>>((acc, s) => {
    const dateRaw = s.event_date || s.survey_date;
    const slot = s.time_slot ?? s.survey_time_slot ?? null;
    if (!dateRaw) return acc;
    const key = dateRaw.slice(0, 10);
    if (!acc[key]) acc[key] = new Set();
    const set = acc[key];
    if (!slot) {
      // Full-day event (install / block) — covers every slot.
      HOURLY_SLOTS.forEach(h => set.add(h));
      set.add("FULL");
      return acc;
    }
    parseSlots(slot).forEach(h => set.add(h));
    return acc;
  }, {});

  // Currently selected hourly slots for this picker (multi-select).
  const selectedSlots = parseSlots(timeSlot);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const months = [
    new Date(today.getFullYear(), today.getMonth(), 1),
    new Date(today.getFullYear(), today.getMonth() + 1, 1),
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {months.map(monthStart => {
          const monthLabel = monthStart.toLocaleDateString("th-TH", { month: "long" });
          const firstDayOfWeek = monthStart.getDay();
          const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
          return (
            <div key={monthStart.toISOString()}>
              <div className="text-xs font-semibold text-gray-700 mb-1 text-center">{monthLabel}</div>
              <div className="grid grid-cols-7 mb-0.5">
                {WEEKDAYS.map((w, i) => (
                  <div key={w} className={`text-xs text-center font-semibold py-0.5 ${i === 0 || i === 6 ? "text-red-400" : "text-gray-400"}`}>{w}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`pad-${i}`} className="h-9" />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1);
                  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  const selected = date === iso;
                  const isPast = d < today;
                  const isToday = d.getTime() === today.getTime();
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const booked = bookedSlotsByDate[iso];
                  const bookedCount = booked ? Array.from(booked).filter(s => s !== "FULL").length : 0;
                  const isFull = !!booked && (booked.has("FULL") || bookedCount >= HOURLY_SLOTS.length);
                  const isPartial = !!booked && bookedCount > 0 && !isFull;
                  // Full-day picker (install) — any prior booking blocks the day.
                  const fullDayEvent = !showTimeSlot;
                  const disabled = isPast || (showSurveySlots && (isFull || (fullDayEvent && isPartial)));
                  let bookedClass = "";
                  if (!isPast && !selected && showSurveySlots) {
                    if (isFull || (fullDayEvent && isPartial)) bookedClass = "bg-red-100 text-red-500";
                    else if (isPartial) bookedClass = "bg-amber-100 text-amber-700";
                  }
                  return (
                    <div key={iso} className="h-9 flex items-center justify-center">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
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
                        style={{ minHeight: 0 }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm leading-none font-semibold transition-all ${
                          selected
                            ? "bg-active text-white shadow-sm shadow-active/30"
                            : isPast
                            ? "text-gray-300 cursor-not-allowed"
                            : bookedClass
                            ? bookedClass + (isFull ? " cursor-not-allowed" : " hover:brightness-95")
                            : isToday
                            ? "bg-active-light text-active ring-1 ring-active/30 hover:bg-active hover:text-white"
                            : `${isWeekend ? "text-red-500" : "text-gray-700"} hover:bg-active-light hover:text-active`
                        }`}
                      >
                        {d.getDate()}
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
              const taken = !!dayBooked && dayBooked.has(s) && !selected;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={taken}
                  onClick={() => {
                    const next = selected
                      ? selectedSlots.filter(x => x !== s)
                      : [...selectedSlots, s].sort();
                    onTimeSlotChange(serializeSlots(next) || "");
                  }}
                  className={`flex items-center justify-center h-8 px-1 rounded-md border transition-all ${
                    selected
                      ? "bg-active border-active text-white shadow-sm shadow-active/20"
                      : taken
                      ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-white border-gray-300 text-gray-900 hover:border-active hover:text-active"
                  }`}
                >
                  <span className="text-[11px] font-semibold font-mono tabular-nums">{slotLabel(s)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
