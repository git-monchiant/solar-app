"use client";

import { Fragment, useState } from "react";
import { apiFetch } from "@/lib/api";
import DateSlider from "@/components/ui/DateSlider";
import CalendarPicker from "@/components/calendar/CalendarPicker";
import ModalBase from "@/components/ui/ModalBase";

type ActivityType = "note" | "follow_up";

const FOLLOW_UP_METHODS: { value: string; label: string; icon: React.ReactNode }[] = [
  {
    value: "call",
    label: "โทร",
    icon: (
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.05-.24c1.12.37 2.33.57 3.57.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.24.2 2.45.57 3.57a1 1 0 01-.24 1.05l-2.21 2.17z" />
      </svg>
    ),
  },
  {
    value: "visit",
    label: "เยี่ยม",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    value: "line",
    label: "LINE",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.44 3.317V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
      </svg>
    ),
  },
  {
    value: "other",
    label: "อื่นๆ",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
  },
];

// §28 — ผลการติดต่อ per attempt. Tone drives the small dot color: ok = green,
// fail = red, neutral = gray. Order matches what sales actually picks most.
type OutcomeRow =
  | { value: string; label: string; tone: "ok" | "fail" | "neutral" }
  | { group: string };
const OUTCOMES: OutcomeRow[] = [
  { value: "ติดต่อได้ - Sale เสนอขาย",          label: "เสนอขายแล้ว",            tone: "ok" },
  { value: "ติดต่อได้ - ลูกค้าไม่สะดวกคุย",       label: "ลูกค้าไม่สะดวกคุย",        tone: "ok" },
  { group: "ติดต่อไม่ได้" },
  { value: "ติดต่อไม่ได้ - ไม่รับสาย",            label: "ไม่รับสาย",               tone: "fail" },
  { value: "ติดต่อไม่ได้ - ข้อมูลติดต่อไม่ถูกต้อง", label: "ข้อมูลติดต่อไม่ถูกต้อง",   tone: "fail" },
  { value: "อื่นๆ",                               label: "อื่นๆ",                    tone: "neutral" },
];

// §7 + §13 — combined, flat list. Shown only when outcome = "เสนอขาย".
// Sales picks whichever phrasing fits this attempt's stage.
const UNDECIDED_REASONS = [
  "ขอคิดดู - ราคา",
  "ขอคิดดู - ความคุ้มค่า",
  "ขอคิดดู - เปรียบเทียบคู่แข่ง",
  "ขอปรึกษาคนที่บ้าน",
  "ราคาสูง ขอส่วนลด",
  "ทำเรื่องสินเชื่อ",
];

// §5 — Interest Reasons (multi-select). Mirrors the prospect form so sales
// can capture WHY the customer is interested when the offer lands. Shown
// alongside UNDECIDED_REASONS when outcome = SALE_OFFER.
const INTEREST_REASONS = [
  "ประหยัดค่าไฟ",
  "เปิดแอร์ทั้งวัน",
  "ลดหย่อนภาษี",
  "เปิดร้านที่บ้าน",
  "แอร์ให้สัตว์เลี้ยง",
  "ขายไฟคืน",
  "ชาร์จ EV",
  "ดูแลผู้สูงอายุ",
  "รักษ์โลก",
  "อื่นๆ",
];

const SALE_OFFER = "ติดต่อได้ - Sale เสนอขาย";

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
  const [outcome, setOutcome] = useState("");
  const [undecidedReason, setUndecidedReason] = useState("");
  // Multi-select — sales can tick more than one reason a customer cares about.
  const [interestReasons, setInterestReasons] = useState<string[]>([]);
  const [nextFollowUpDate, setNextFollowUpDate] = useState("");
  const [nextPickerOpen, setNextPickerOpen] = useState(false);
  const [sendBackToSeeker, setSendBackToSeeker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showUndecided = outcome === SALE_OFFER;

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const isLoanFollowup = typeof loanInstallmentIndex === "number" && activityType === "follow_up";
      // Title carries only the outcome (§28). Undecided reason +
      // interest_reasons live as their own columns on `leads` so the
      // activity timeline stays readable instead of accumulating redundant
      // "· …" suffixes that duplicate structured data.
      const title = activityType === "follow_up" && outcome ? outcome : null;
      await apiFetch(`/api/leads/${leadId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_type: isLoanFollowup
            ? "loan_followup"
            : (activityType === "follow_up" ? (followUpMethod || "follow_up") : "note"),
          title,
          note: note.trim() || null,
          follow_up_date: nextFollowUpDate || null,
          contact_date: followUpDate || null,
          installment_index: isLoanFollowup ? loanInstallmentIndex : undefined,
          followup_method: isLoanFollowup ? (followUpMethod || "follow_up") : undefined,
        }),
      });
      // Persist structured reasons on the lead so dashboards/queries can
      // aggregate. interest_reasons MERGES across follow-ups (multi-select
      // accumulates); undecided_reason OVERWRITES (always the latest state).
      const sendInterest = activityType === "follow_up" && interestReasons.length > 0;
      const sendUndecided = activityType === "follow_up" && !!undecidedReason;
      if (sendInterest || sendUndecided) {
        try {
          const patch: Record<string, string> = {};
          if (sendInterest) {
            const lead = await apiFetch(`/api/leads/${leadId}`);
            const existing = (lead?.interest_reasons || "").split(",").map((s: string) => s.trim()).filter(Boolean);
            const merged = Array.from(new Set([...existing, ...interestReasons]));
            patch.interest_reasons = merged.join(",");
          }
          if (sendUndecided) patch.undecided_reason = undecidedReason;
          await apiFetch(`/api/leads/${leadId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
        } catch (e) {
          // Non-fatal — activity already saved. Surface in console for triage.
          console.error("reasons sync failed:", e);
        }
      }
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
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSaving(false);
    }
  };

  // Note modal — simple, separate
  if (activityType === "note") {
    return (
      <ModalBase
        title={
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </span>
            <span>บันทึกโน้ต</span>
          </div>
        }
        onClose={onClose}
        size="md"
        footer={
          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white">
              ยกเลิก
            </button>
            <button onClick={handleSubmit} disabled={saving || !note.trim()}
              className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 active:scale-[0.98] transition-all">
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="บันทึกโน้ต..."
            rows={4}
            autoFocus
            className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-primary text-sm resize-none"
          />
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
          )}
        </div>
      </ModalBase>
    );
  }

  // Follow-up modal — single-column linear flow. The form content sits in a
  // centered max-w-2xl rail so a wide modal still reads like a focused form.
  // Each section is one decision; the conditional reason picker appears
  // inline below the outcome row when "เสนอขาย" is selected.
  const canSubmit = !saving && !!followUpMethod && !!followUpDate && !!outcome;

  const dotClass = (tone: "ok" | "fail" | "neutral", selected: boolean) => {
    const base = "w-2 h-2 rounded-full flex-shrink-0";
    if (selected) {
      if (tone === "ok") return `${base} bg-emerald-500`;
      if (tone === "fail") return `${base} bg-red-500`;
      return `${base} bg-gray-500`;
    }
    if (tone === "ok") return `${base} bg-emerald-300`;
    if (tone === "fail") return `${base} bg-red-300`;
    return `${base} bg-gray-300`;
  };

  return (
    <ModalBase
      title={
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
          <span>บันทึกการติดตาม</span>
        </div>
      }
      onClose={onClose}
      size="2xl"
      footer={
        <div className="flex gap-2 max-w-2xl mx-auto">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`flex-1 py-3 rounded-xl font-bold text-sm text-white active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
              sendBackToSeeker ? "bg-amber-500 hover:bg-amber-600" : "bg-primary"
            }`}
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>{sendBackToSeeker ? "กำลังส่งกลับ…" : "กำลังบันทึก…"}</span>
              </>
            ) : sendBackToSeeker ? "บันทึก + ส่งกลับ Seeker" : "บันทึก"}
          </button>
        </div>
      }
    >
      <div className="max-w-2xl mx-auto space-y-5">
        {/* 1. วันที่ */}
        <section>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            วันที่ติดตาม <span className="text-red-500">*</span>
          </div>
          <div className="-mx-5">
            <DateSlider date={followUpDate} onDateChange={setFollowUpDate} pastDays={15} futureDays={0} />
          </div>
        </section>

        {/* 2. ช่องทาง */}
        <section>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            ช่องทางติดต่อ <span className="text-red-500">*</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {FOLLOW_UP_METHODS.map(m => (
              <button
                key={m.value}
                type="button"
                onClick={() => setFollowUpMethod(m.value)}
                style={{ minHeight: 0 }}
                className={`py-2 rounded-lg text-sm font-semibold border transition-all flex items-center justify-center gap-1.5 ${
                  followUpMethod === m.value
                    ? "bg-active text-white border-active"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>
        </section>

        {/* 3. ผลการติดต่อ — flat radio rows, dot color encodes tone */}
        <section>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
            </svg>
            <span>ติดต่อได้ <span className="text-red-500">*</span></span>
          </div>
          <div className="space-y-1.5">
            {OUTCOMES.map((o, i) => {
              if ("group" in o) {
                return (
                  <div
                    key={`g-${i}`}
                    className="text-xs font-bold text-gray-400 uppercase tracking-wider pt-2 pb-0.5 flex items-center gap-1.5"
                  >
                    <svg className="w-3.5 h-3.5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                      <path d="M14 4l4 4M18 4l-4 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                    </svg>
                    <span>{o.group}</span>
                  </div>
                );
              }
              const selected = outcome === o.value;
              return (
                <Fragment key={o.value}>
                  <button
                    type="button"
                    onClick={() => {
                      setOutcome(o.value);
                      if (o.value !== SALE_OFFER) {
                        setUndecidedReason("");
                        setInterestReasons([]);
                      }
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors flex items-center gap-3 ${
                      selected
                        ? "border-gray-800 bg-gray-50 text-gray-900 font-semibold"
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <span className={dotClass(o.tone, selected)} />
                    <span className="flex-1">{o.label}</span>
                    {selected && (
                      <svg className="w-4 h-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                  {o.value === SALE_OFFER && showUndecided && (
                    <div className="pl-3 pr-1 py-2 space-y-3 border-l-2 border-gray-200 ml-1">
                      <div>
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                          เหตุผลที่ยังไม่ตัดสินใจ <span className="font-normal text-gray-400">(ถ้ามี)</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {UNDECIDED_REASONS.map((r) => {
                            const sel = undecidedReason === r;
                            return (
                              <button
                                key={r}
                                type="button"
                                onClick={() => setUndecidedReason(sel ? "" : r)}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                  sel
                                    ? "bg-amber-500 text-white border-amber-500"
                                    : "bg-white text-gray-700 border-gray-200 hover:border-amber-300"
                                }`}
                              >
                                {r}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                          เหตุผลที่สนใจ <span className="font-normal text-gray-400">(เลือกได้หลายอัน)</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {INTEREST_REASONS.map((r) => {
                            const sel = interestReasons.includes(r);
                            return (
                              <button
                                key={r}
                                type="button"
                                onClick={() => setInterestReasons(prev =>
                                  sel ? prev.filter(x => x !== r) : [...prev, r]
                                )}
                                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                  sel
                                    ? "bg-emerald-500 text-white border-emerald-500"
                                    : "bg-white text-gray-700 border-gray-200 hover:border-emerald-300"
                                }`}
                              >
                                {r}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        </section>

        {/* 4. หมายเหตุ */}
        <section>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
            หมายเหตุ
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="รายละเอียดเพิ่มเติม..."
            rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-primary text-sm resize-none"
          />
        </section>

        {/* 5. ส่งกลับ Seeker — conditional, after note so it reads "and send back" */}
        {canSendBack && (
          <label className={`flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${sendBackToSeeker ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
            <input
              type="checkbox"
              checked={sendBackToSeeker}
              onChange={(e) => setSendBackToSeeker(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-amber-500 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-800">ส่งกลับทีม Lead Seeker</div>
              <div className="text-xxs text-gray-500 mt-0.5">โปรดระบุเหตุผลในหมายเหตุ</div>
            </div>
          </label>
        )}

        {/* 6. นัดติดตามครั้งถัดไป */}
        <section>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">นัดติดตามครั้งถัดไป</div>
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
        </section>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
        )}
      </div>
    </ModalBase>
  );
}

export type { ActivityType };
