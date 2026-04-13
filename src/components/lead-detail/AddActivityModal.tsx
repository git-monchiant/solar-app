"use client";

import { useState } from "react";

type ActivityType = "note" | "call" | "visit" | "follow_up";

const typeLabels: Record<ActivityType, string> = {
  note: "Note",
  call: "Call",
  visit: "Visit",
  follow_up: "Follow Up",
};

const WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

interface Props {
  activityType: ActivityType;
  leadId: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddActivityModal({ activityType, leadId, onClose, onSaved }: Props) {
  const [note, setNote] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!note.trim() && activityType !== "follow_up") return;
    setSaving(true);
    try {
      await fetch(`/api/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({
          activity_type: activityType,
          note: note.trim() || null,
          follow_up_date: followUpDate || null,
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

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md p-5 pb-8 md:pb-5 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">Log {typeLabels[activityType]}</h3>
          <button onClick={onClose} className="text-gray/40 hover:text-gray p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {activityType === "follow_up" && (() => {
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const months = [
            new Date(today.getFullYear(), today.getMonth(), 1),
            new Date(today.getFullYear(), today.getMonth() + 1, 1),
          ];
          return (
            <div className="mb-3">
              <label className="block text-sm font-semibold mb-2">Follow-up Date</label>
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
                          const selected = followUpDate === iso;
                          const isPast = d < today;
                          const isToday = d.getTime() === today.getTime();
                          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                          return (
                            <div key={iso} className="h-9 flex items-center justify-center">
                              <button
                                type="button"
                                disabled={isPast}
                                onClick={() => setFollowUpDate(iso)}
                                style={{ minHeight: 0 }}
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm leading-none font-semibold transition-all ${
                                  selected
                                    ? "bg-active text-white shadow-sm shadow-active/30"
                                    : isPast
                                    ? "text-gray-300 cursor-not-allowed"
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
            </div>
          );
        })()}

        <div className="mb-4">
          <label className="block text-sm font-semibold mb-1">Note</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={`What happened during this ${typeLabels[activityType].toLowerCase()}?`}
            rows={4}
            autoFocus
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-primary text-sm resize-none"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving || (!note.trim() && activityType !== "follow_up")}
          className="w-full py-3.5 bg-primary text-white rounded-xl font-bold text-sm active:scale-[0.98] disabled:opacity-50 transition-all"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

export type { ActivityType };
