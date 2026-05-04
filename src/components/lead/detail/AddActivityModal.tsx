"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import DateSlider from "@/components/ui/DateSlider";
import CalendarPicker from "@/components/calendar/CalendarPicker";
import ModalCloseButton from "@/components/ui/ModalCloseButton";

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
  /** Show "ส่งกลับ Seeker" option — only when lead is still returnable
   * (came from prospect AND hasn't advanced past pre-survey / paid deposit). */
  canSendBack?: boolean;
  /** Tag this follow-up as belonging to a loan installment row. When set, the
   * saved activity gets activity_type="loan_followup" + a "[งวดที่ N]" prefix
   * in its title so the order step can show them grouped per row. */
  loanInstallmentIndex?: number;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddActivityModal({ activityType, leadId, canSendBack = false, loanInstallmentIndex, onClose, onSaved }: Props) {
  const [note, setNote] = useState("");
  const [followUpDate, setFollowUpDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [followUpMethod, setFollowUpMethod] = useState("");
  const [nextFollowUpDate, setNextFollowUpDate] = useState("");
  const [nextPickerOpen, setNextPickerOpen] = useState(false);
  const [sendBackToSeeker, setSendBackToSeeker] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const isLoanFollowup = typeof loanInstallmentIndex === "number" && activityType === "follow_up";
      await apiFetch(`/api/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_type: isLoanFollowup
            ? "loan_followup"
            : (activityType === "follow_up" ? (followUpMethod || "follow_up") : "note"),
          note: note.trim() || null,
          follow_up_date: nextFollowUpDate || null,
          contact_date: followUpDate || null,
          installment_index: isLoanFollowup ? loanInstallmentIndex : undefined,
          followup_method: isLoanFollowup ? (followUpMethod || "follow_up") : undefined,
        }),
      });
      if (sendBackToSeeker && activityType === "follow_up") {
        await apiFetch(`/api/leads/${leadId}/return-to-prospect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: note.trim() || null }),
        });
      }
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
      <div className="relative bg-white w-full h-full md:h-auto md:max-h-[90vh] md:rounded-2xl md:max-w-md md:animate-slide-up flex flex-col">
        <div className="shrink-0 bg-white flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 safe-top">
          <h3 className="font-bold text-lg">Follow-up</h3>
          <ModalCloseButton onClick={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pb-4">
          {/* วันที่ติดตาม — DateSlider */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 px-5">
              วันที่ติดตาม <span className="text-red-500">*</span>
            </div>
            <DateSlider date={followUpDate} onDateChange={setFollowUpDate} pastDays={15} futureDays={0} />
          </div>

          {/* ช่องทางติดต่อ + Note — same row feeling */}
          <div className="px-5 flex gap-2">
            <div className="flex-1">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
                ช่องทางติดต่อ <span className="text-red-500">*</span>
              </div>
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
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Note <span className="text-red-500">*</span>
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ผลการติดตาม..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-primary text-sm resize-none"
            />
          </div>

          {/* ส่งกลับทีม Lead Seeker — เฉพาะ lead ที่ยัง pre-survey + มาจาก prospect */}
          {canSendBack && (
            <div className="px-5">
              <label className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${sendBackToSeeker ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                <input
                  type="checkbox"
                  checked={sendBackToSeeker}
                  onChange={(e) => setSendBackToSeeker(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-amber-500 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800">ส่งกลับทีม Lead Seeker</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">โปรดระบุเหตุผลส่งกลับใน NOTE</div>
                </div>
              </label>
            </div>
          )}

          {/* นัดติดตามครั้งถัดไป — collapsed by default */}
          <div className="px-5">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">นัดติดตามครั้งถัดไป</div>
            {!nextPickerOpen ? (
              <button
                type="button"
                onClick={() => setNextPickerOpen(true)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 bg-white hover:border-primary hover:bg-primary/5 transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                  {nextFollowUpDate ? (
                    <span className="text-sm font-semibold text-gray-800 truncate">
                      {new Date(nextFollowUpDate.slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">เลือกวันนัดติดตาม (ไม่บังคับ)</span>
                  )}
                </div>
                <span className="text-xs text-primary font-semibold shrink-0">{nextFollowUpDate ? "แก้ไข" : "เลือก"}</span>
              </button>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                <CalendarPicker
                  date={nextFollowUpDate}
                  timeSlot=""
                  onDateChange={(d) => { setNextFollowUpDate(d); }}
                  onTimeSlotChange={() => {}}
                  showTimeSlot={false}
                />
                <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => { setNextFollowUpDate(""); setNextPickerOpen(false); }}
                    className="px-3 h-8 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100"
                  >
                    ล้าง
                  </button>
                  <button
                    type="button"
                    onClick={() => setNextPickerOpen(false)}
                    className="px-4 h-8 rounded-lg text-xs font-semibold bg-primary text-white hover:brightness-110"
                  >
                    ปิด
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Submit — pinned at bottom so it's never clipped by the viewport */}
        <div className="shrink-0 px-5 pt-3 pb-10 border-t border-gray-100 bg-white" style={{ paddingBottom: "max(2.5rem, env(safe-area-inset-bottom))" }}>
          {(() => {
            const canSubmit = !saving && !!followUpMethod && !!followUpDate && !!note.trim();
            return (
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`w-full py-3 rounded-xl font-bold text-sm text-white active:scale-[0.98] transition-all flex items-center justify-center gap-2 ${
              !canSubmit
                ? "bg-gray-300 cursor-not-allowed"
                : sendBackToSeeker
                ? "bg-amber-500 hover:bg-amber-600"
                : "bg-primary"
            }`}
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{sendBackToSeeker ? "กำลังส่งกลับ…" : "กำลังบันทึก…"}</span>
              </>
            ) : sendBackToSeeker ? "บันทึกและส่งข้อมูลไปยัง Lead Seeker" : "บันทึก"}
          </button>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

export type { ActivityType };
