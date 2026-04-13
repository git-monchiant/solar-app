"use client";

import { useState } from "react";
import DateSlider from "@/components/DateSlider";
import CalendarPicker from "@/components/CalendarPicker";

type ActivityType = "note" | "follow_up";

const FOLLOW_UP_METHODS = [
  { value: "call", label: "โทร" },
  { value: "visit", label: "เยี่ยม" },
  { value: "line", label: "LINE" },
  { value: "other", label: "อื่นๆ" },
];

interface Props {
  activityType: ActivityType;
  leadId: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddActivityModal({ activityType, leadId, onClose, onSaved }: Props) {
  const [note, setNote] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpMethod, setFollowUpMethod] = useState("");
  const [nextFollowUpDate, setNextFollowUpDate] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await fetch(`/api/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({
          activity_type: activityType === "follow_up" ? (followUpMethod || "follow_up") : "note",
          note: note.trim() || null,
          follow_up_date: nextFollowUpDate || null,
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Note modal — simple
  if (activityType === "note") {
    return (
      <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-5 pb-8 md:pb-5 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">Note</h3>
            <button onClick={onClose} style={{ minHeight: 0 }} className="text-gray-400 hover:text-gray-600 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="บันทึกโน้ต..."
            rows={4}
            autoFocus
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-primary text-sm resize-none mb-4"
          />
          <button
            onClick={handleSubmit}
            disabled={saving || !note.trim()}
            className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    );
  }

  // Follow-up modal — full screen on mobile
  return (
    <div className="fixed inset-0 z-[60] md:flex md:items-center md:justify-center">
      <div className="hidden md:block absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white w-full h-full md:h-auto md:max-h-[90vh] md:rounded-2xl md:max-w-md md:animate-slide-up overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 safe-top">
          <h3 className="font-bold text-lg">Follow-up</h3>
          <button onClick={onClose} style={{ minHeight: 0 }} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-3">
          {/* วันที่ติดตาม — DateSlider */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 px-5">วันที่ติดตาม</div>
            <DateSlider date={followUpDate} onDateChange={setFollowUpDate} pastDays={15} futureDays={0} />
          </div>

          {/* วิธีติดตาม + Note — same row feeling */}
          <div className="px-5 flex gap-2">
            <div className="flex-1">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">วิธี</div>
              <div className="flex flex-wrap gap-1.5">
                {FOLLOW_UP_METHODS.map(m => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setFollowUpMethod(m.value)}
                    style={{ minHeight: 0 }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      followUpMethod === m.value
                        ? "bg-active text-white border-active"
                        : "bg-white text-gray-600 border-gray-200"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="px-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Note</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ผลการติดตาม..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-primary text-sm resize-none"
            />
          </div>

          {/* นัดติดตามครั้งถัดไป — compact calendar */}
          <div className="px-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">นัดติดตามครั้งถัดไป</div>
            <CalendarPicker
              date={nextFollowUpDate}
              timeSlot=""
              onDateChange={setNextFollowUpDate}
              onTimeSlotChange={() => {}}
              showTimeSlot={false}
            />
          </div>

          {/* Submit */}
          <div className="px-5">
            <button
              onClick={handleSubmit}
              disabled={saving || !followUpMethod}
              className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export type { ActivityType };
