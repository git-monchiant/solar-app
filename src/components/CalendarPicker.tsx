"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const TIME_SLOTS = [
  { value: "morning", time: "09:00 - 12:00" },
  { value: "afternoon", time: "13:00 - 16:00" },
];

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

  const surveyCountByDate = surveys.reduce<Record<string, { morning: number; afternoon: number }>>((acc, s) => {
    const dateRaw = s.event_date || s.survey_date;
    const slot = s.time_slot ?? s.survey_time_slot;
    if (!dateRaw) return acc;
    // Include both survey and install events — both occupy the day
    const key = dateRaw.slice(0, 10);
    if (!acc[key]) acc[key] = { morning: 0, afternoon: 0 };
    if (slot === "morning") acc[key].morning++;
    else if (slot === "afternoon") acc[key].afternoon++;
    // Install events (no slot) occupy both — blocks the day
    else { acc[key].morning++; acc[key].afternoon++; }
    return acc;
  }, {});

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
                  const counts = surveyCountByDate[iso];
                  const isFull = !!(counts && counts.morning > 0 && counts.afternoon > 0);
                  const isPartial = !!(counts && (counts.morning > 0 || counts.afternoon > 0) && !isFull);
                  const disabled = isPast || (showSurveySlots && isFull);
                  let bookedClass = "";
                  if (!isPast && !selected && showSurveySlots) {
                    if (isFull) bookedClass = "bg-red-100 text-red-500";
                    else if (isPartial) bookedClass = "bg-amber-100 text-amber-700";
                  }
                  return (
                    <div key={iso} className="h-9 flex items-center justify-center">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          onDateChange(iso);
                          // Keep time slot if it doesn't conflict; clear only if the slot is already taken
                          const c = surveyCountByDate[iso];
                          const conflict = !!(c && timeSlot && (timeSlot === "morning" ? c.morning > 0 : c.afternoon > 0));
                          if (conflict) onTimeSlotChange("");
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

      {/* Time slot — always visible */}
      {showTimeSlot && (
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="text-xs font-semibold tracking-wider uppercase text-gray-400 mb-2">
            ช่วงเวลา {required && <span className="text-red-500">*</span>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {TIME_SLOTS.map(s => {
              const selected = timeSlot === s.value;
              const counts = date && showSurveySlots ? surveyCountByDate[date] : null;
              const taken = !!(counts && (s.value === "morning" ? counts.morning > 0 : counts.afternoon > 0));
              return (
                <button
                  key={s.value}
                  type="button"
                  disabled={taken}
                  onClick={() => onTimeSlotChange(s.value)}
                  className={`flex items-center justify-center py-2.5 px-3 rounded-lg border transition-all ${
                    selected
                      ? "bg-active border-active text-white shadow-sm shadow-active/20"
                      : taken
                      ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-white border-gray-300 text-gray-900 hover:border-active hover:text-active"
                  }`}
                >
                  <span className="text-[15px] font-bold font-mono tabular-nums">{s.time}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
