"use client";

import { useState } from "react";
import CalendarPicker from "./CalendarPicker";
import { formatSlotsRange } from "@/lib/time-slots";
import { formatThaiDate as formatDate } from "@/lib/utils/formatters";

export interface TimeSlot {
  value: string;
  label: string;
  time: string;
}

interface Props {
  title: string;
  currentDate: string | null;
  currentSlot?: string | null;
  showTimeSlot?: boolean;
  /** @deprecated Time slots are now hourly multi-select; CalendarPicker
   * renders the chips itself. Retained so existing callers compile. */
  timeSlots?: TimeSlot[];
  excludeLeadId?: number;
  onCancel: () => void;
  onSave: (picked: { date: string; slot: string }) => void | Promise<void>;
}

export default function AppointmentRescheduler({
  title,
  currentDate,
  currentSlot,
  showTimeSlot = false,
  excludeLeadId,
  onCancel,
  onSave,
}: Props) {
  const [date, setDate] = useState<string>(currentDate ? currentDate.slice(0, 10) : "");
  const [slot, setSlot] = useState<string>(currentSlot ?? "");
  const [saving, setSaving] = useState(false);

  const slotLabel = formatSlotsRange(slot);
  const canSave = !!date && (!showTimeSlot || !!slot);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({ date, slot });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">{title}</div>

      <CalendarPicker
        date={date}
        timeSlot={slot}
        onDateChange={setDate}
        onTimeSlotChange={setSlot}
        showTimeSlot={showTimeSlot}
        showSurveySlots
        excludeLeadId={excludeLeadId}
      />

      {date && (
        <div className="rounded-lg bg-active-light border border-active/20 p-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-active shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-active/70">เลื่อนเป็น</div>
            <div className="text-sm font-bold text-active">
              {formatDate(date)}
              {showTimeSlot && slotLabel && <span className="ml-1.5 font-mono tabular-nums">{slotLabel}</span>}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 h-11 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:border-gray-400"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving}
          className="flex-[2] h-11 rounded-lg text-sm font-bold text-white bg-active hover:bg-active-dark disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-active/30 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              กำลังบันทึก…
            </>
          ) : !canSave ? (
            showTimeSlot ? "เลือกวันและเวลา" : "เลือกวัน"
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              ยืนยันเลื่อนนัด
            </>
          )}
        </button>
      </div>
    </div>
  );
}
