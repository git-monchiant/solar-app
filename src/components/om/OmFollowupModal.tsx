"use client";

// บันทึกการติดตามของงาน O&M — ปุ่ม Follow-up ข้าง Note แบบหน้า lead
// ★ 1 ต.ค. 69 ผู้ใช้สั่ง "ต้องการหน้าตาแบบนี้เลย" = modal Follow-up ของ AddActivityModal (หน้า lead) ทั้งหน้า
//   วันที่ติดตาม → ช่องทางติดต่อ → ติดต่อได้ / ติดต่อไม่ได้ → หมายเหตุ → นัดติดตามครั้งถัดไป → ยกเลิก/บันทึก
//   ไม่ยก: SMS (O&M ไม่มีระบบส่ง SMS) · เหตุผลใต้ "เสนอขาย" (ของงานขาย)
// ★ แบ่งงานแบบฝั่งขาย: การ์ดขั้นงาน = ผลที่ทำให้งานเดินหน้า (ตกลงนัด / ปฏิเสธ)
//   ปุ่ม Follow-up = การติดต่อที่ยังไม่ได้ข้อสรุป — กดได้ทุกขั้น
// ★ ผลเทียบของฝั่งขายเป็นความหมาย O&M:
//   เสนอขายแล้ว → แจ้งรอบล้างแล้ว (informed) · ลูกค้าไม่สะดวกคุย (busy)
//   ไม่รับสาย (no_answer — นับครั้ง ครบแล้วย้ายแท็บติดต่อไม่ได้) · ข้อมูลติดต่อไม่ถูกต้อง (wrong_number) · อื่นๆ (other)
// ★ บันทึกผ่าน POST /api/om/follow ตัวเดิม — ช่องทาง/วันที่ติดตามจดใน to_json ของประวัติ
import { Fragment, useState } from "react";
import { apiFetch } from "@/lib/api";
import ModalBase from "@/components/ui/ModalBase";
import DateSlider from "@/components/ui/DateSlider";
import CalendarPicker from "@/components/calendar/CalendarPicker";
import { CheckIcon, ClockIcon, LineIcon, PhoneIcon } from "@/components/ui/icons";

// ช่องทาง — ชุดเดียวกับ FOLLOW_UP_METHODS ของหน้า lead (ไอคอนเดียวกัน)
const METHODS: { value: string; label: string; icon: React.ReactNode }[] = [
  { value: "call", label: "โทร", icon: <PhoneIcon className="w-4 h-4" /> },
  {
    value: "visit", label: "ลงพื้นที่",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  { value: "line", label: "LINE", icon: <LineIcon className="w-4 h-4" /> },
  {
    value: "other", label: "อื่น ๆ",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
  },
];

// ผลการติดต่อ — แถวเรียบ จุดสีบอกกลุ่ม (ok เขียว · fail แดง · neutral เทา) แบบ OUTCOMES ของหน้า lead
type OutcomeRow = { value: string; label: string; tone: "ok" | "fail" | "neutral" } | { group: string };
const OUTCOMES: OutcomeRow[] = [
  { value: "informed", label: "แจ้งรอบล้างแล้ว", tone: "ok" },
  { value: "busy", label: "ลูกค้าขอให้ติดต่อภายหลัง", tone: "ok" },
  { group: "ติดต่อไม่ได้" },
  { value: "no_answer", label: "ไม่รับสาย", tone: "fail" },
  { value: "wrong_number", label: "ข้อมูลติดต่อไม่ถูกต้อง", tone: "fail" },
  { value: "other", label: "อื่น ๆ", tone: "neutral" },
];

const ymd = (d: Date) => d.toLocaleDateString("sv-SE");
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };

export default function OmFollowupModal({ houseId, bookingId, phone, rules, jobActive, onClose, onSaved }: {
  houseId: number;
  bookingId: number | null;
  /** เบอร์ที่โทร — "ข้อมูลติดต่อไม่ถูกต้อง" ทางโทรทำเครื่องหมายเบอร์นี้ */
  phone: string | null;
  /** ค่าในหน้าตั้งค่า O&M (call.*) */
  rules?: Record<string, unknown>;
  /** ใบงานเดินหน้าไปแล้ว (เสนอราคาขึ้นไป) — ไม่รับสายไม่ย้ายแท็บ แค่จดประวัติ */
  jobActive: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const num = (k: string, d: number) => (rules?.[k] != null && !Number.isNaN(Number(rules[k])) ? Number(rules[k]) : d);
  const retryDays = num("call.retry_days", 3);
  const maxTry = num("call.max_attempts", 3);
  const [followUpDate, setFollowUpDate] = useState(ymd(new Date()));
  const [method, setMethod] = useState("");
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [nextPickerOpen, setNextPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const pick = (v: string) => {
    setOutcome(v); setError("");
    // ไม่รับสาย / ไม่สะดวกคุย — เลือกวันโทรใหม่ตามหน้าตั้งค่าไว้ก่อน (ไม่รับสาย = กติกาเดียวกับ API) แก้ได้
    if ((v === "no_answer" || v === "busy") && !nextDate) setNextDate(plusDays(retryDays));
  };

  const canSubmit = !saving && !!followUpDate && !!method && !!outcome;
  const save = async () => {
    if (!canSubmit) return;
    setSaving(true); setError("");
    try {
      await apiFetch("/api/om/follow", {
        method: "POST",
        body: JSON.stringify({
          house_id: houseId, booking_id: bookingId, outcome, channel: method, contact_date: followUpDate,
          note: note.trim() || null, next_date: nextDate || null, phone,
        }),
      });
      onSaved("บันทึกการติดตามแล้ว");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  // ผลของตัวเลือก — บอกก่อนกด (ของ O&M เพิ่มจากฝั่งขาย: ไม่รับสายครบกี่ครั้งจะย้ายแท็บ)
  const hint = outcome === "no_answer"
    ? (jobActive ? "บันทึกประวัติเท่านั้น ใบงานอยู่ขั้นเดิม" : `บันทึกประวัติ · หากไม่รับสายครบ ${maxTry} ครั้ง จะย้ายไปแท็บติดต่อไม่ได้`)
    : outcome === "wrong_number"
    ? (method === "call" ? `ทำเครื่องหมายเบอร์${phone ? ` ${phone}` : "นี้"}ว่าใช้ไม่ได้ · ` : "") + (jobActive ? "ใบงานอยู่ขั้นเดิม" : "ย้ายไปแท็บติดต่อไม่ได้")
    : "";

  const dotClass = (tone: "ok" | "fail" | "neutral", selected: boolean) => {
    const base = "w-2 h-2 rounded-full flex-shrink-0";
    if (selected) return `${base} ${tone === "ok" ? "bg-emerald-500" : tone === "fail" ? "bg-red-500" : "bg-gray-500"}`;
    return `${base} ${tone === "ok" ? "bg-emerald-300" : tone === "fail" ? "bg-red-300" : "bg-gray-300"}`;
  };

  return (
    <ModalBase
      title={
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
            <ClockIcon className="w-4 h-4" strokeWidth={2} />
          </span>
          {/* ★ 21 ต.ค. 69 แผน 20261021-01: เปิดจากปุ่มอังกฤษ "Follow-up" (ชุดเดียวกับหน้า lead) — หัวหน้าต่างใช้คำเดียวกับปุ่ม */}
          <span>Follow-up — บันทึกการติดตาม</span>
        </div>
      }
      onClose={onClose}
      size="2xl"
      footer={
        <div className="flex gap-2 max-w-2xl mx-auto">
          <button type="button" onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white cursor-pointer">
            ยกเลิก
          </button>
          <button type="button" onClick={save} disabled={!canSubmit}
            className="flex-1 py-3 rounded-xl font-bold text-sm text-white bg-primary active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>กำลังบันทึก…</span>
              </>
            ) : "บันทึก"}
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
          <div className="grid grid-cols-6 gap-1.5">
            {METHODS.map((m) => (
              <button key={m.value} type="button" onClick={() => setMethod(m.value)} style={{ minHeight: 0 }}
                className={`py-2 rounded-lg text-sm font-semibold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  method === m.value ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}>
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>
        </section>

        {/* 3. ผลการติดต่อ — แถวเรียบ จุดสีบอกกลุ่ม */}
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
                  <div key={`g-${i}`} className="text-xs font-bold text-gray-400 uppercase tracking-wider pt-2 pb-0.5 flex items-center gap-1.5">
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
                  <button type="button" onClick={() => pick(o.value)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors flex items-center gap-3 cursor-pointer ${
                      selected ? "border-gray-800 bg-gray-50 text-gray-900 font-semibold" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}>
                    <span className={dotClass(o.tone, selected)} />
                    <span className="flex-1">{o.label}</span>
                    {selected && <CheckIcon className="w-4 h-4 text-gray-700" strokeWidth={3} />}
                  </button>
                  {selected && hint && <div className="pl-3 text-xs text-gray-500 leading-relaxed">{hint}</div>}
                </Fragment>
              );
            })}
          </div>
        </section>

        {/* 4. หมายเหตุ */}
        <section>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">หมายเหตุ</div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="รายละเอียดเพิ่มเติม..." rows={3}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-primary text-sm resize-none" />
        </section>

        {/* 5. นัดติดตามครั้งถัดไป */}
        <section>
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">นัดติดตามครั้งถัดไป</div>
          {!nextPickerOpen ? (
            <button type="button" onClick={() => setNextPickerOpen(true)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 bg-white hover:border-primary hover:bg-primary/5 transition-colors text-left cursor-pointer">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                {nextDate ? (
                  <span className="text-sm font-semibold text-gray-800 truncate">
                    {new Date(`${nextDate}T12:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })}
                    {nextDate === plusDays(retryDays) && (outcome === "no_answer" || outcome === "busy") && (
                      <span className="ml-1.5 text-xs font-normal text-gray-400">ค่าเริ่มต้น +{retryDays} วันตามหน้าตั้งค่า</span>
                    )}
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">เลือกวันนัดติดตาม (ไม่บังคับ)</span>
                )}
              </div>
              <span className="text-xs text-primary font-semibold shrink-0">{nextDate ? "แก้ไข" : "เลือก"}</span>
            </button>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
              <CalendarPicker date={nextDate} timeSlot="" onDateChange={setNextDate} onTimeSlotChange={() => {}} showTimeSlot={false} />
              <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
                <button type="button" onClick={() => { setNextDate(""); setNextPickerOpen(false); }}
                  className="px-3 h-8 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100 cursor-pointer">ล้าง</button>
                <button type="button" onClick={() => setNextPickerOpen(false)}
                  className="px-4 h-8 rounded-lg text-xs font-semibold bg-primary text-white hover:brightness-110 cursor-pointer">ปิด</button>
              </div>
            </div>
          )}
        </section>

        {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>}
      </div>
    </ModalBase>
  );
}
