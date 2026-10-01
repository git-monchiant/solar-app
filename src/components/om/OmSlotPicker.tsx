"use client";

// วันนัด + ช่วงเวลาของงาน O&M — แผน 20260929-03 ข้อ 1
// ★ ย้ายออกจาก OmRescheduler (ไม่ได้ก๊อป) ใช้ 3 ที่: ขั้น 01 ตกลงนัด · การ์ดนัดหมายตอนชำระเงินแล้ว · Reschedule
//   เดิมขั้น 01 ใช้ช่อง datetime-local — พิมพ์เอง · ไม่เห็นว่าช่วงไหนเต็ม · ใส่เวลานอกช่วงทำการได้ (เช่น 14:37)
//   · รูปแบบเปลี่ยนตามภาษาเครื่อง (วว/ดด/ปปปป vs mm/dd/yyyy)
// ★ 1 ต.ค. 69 ผู้ใช้สั่งให้หน้าตาเหมือน "เลื่อนนัดสำรวจ" ฝั่งขาย (AppointmentRescheduler)
//   วัน = ปฏิทิน 3 เดือน CalendarPicker ตัวเดียวกับฝั่งขาย (เดิม DateSlider แถบเลื่อน)
//   ปิด showSurveySlots/showTimeSlot ⇒ ใช้แค่ตารางวัน ไม่ไปนับคิวทีมสำรวจ/ติดตั้งของ lead
//   ช่วงเวลา = ตาราง 4 ช่องแบบ CalendarPicker แต่ยังเป็นของ O&M (ความจุ) ไม่ใช่ HOURLY_SLOTS ฝั่งขาย
// ★ ช่วงเวลา + ความจุมาจาก om_slot_config (ห้าม hardcode) — ชุดเดียวกับปฏิทิน / จ่ายงาน
//   ช่องเต็มยังกดได้แต่เลขแดง (แบบลากในปฏิทิน) · ไม่นับใบยกเลิก/ไม่อยู่บ้าน
// ★ ช่วงวัน/ระยะล่วงหน้าจากหน้าตั้งค่า (booking.advance_days_max · booking.advance_hours_min)
//   ไกลเกิน advance_days_max = เลือกช่วงเวลาไม่ได้ (เดิมแถบวันไม่มีให้เลือกเลย — ปฏิทินโชว์ 3 เดือนเต็มจึงกันที่ช่วงเวลาแทน)
//   นัดใกล้กว่าที่ตั้งไว้ = เตือนเฉย ๆ ไม่บล็อก — API ยังไม่บังคับกติกานี้ (แนวเดียวกับช่องเต็ม/เลื่อนเกินเพดาน)
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import CalendarPicker from "@/components/calendar/CalendarPicker";
import { formatThaiDate } from "@/lib/utils/formatters";

type Slot = { id: number; weekday: number; start_time: string; end_time: string; capacity: number; is_open: number };
type Row = { id: number; scheduled_at: string | null; status: string };
// ใบที่ยกเลิก/ลูกค้าไม่อยู่บ้าน ไม่กินคิวของช่วงเวลา
const FREED = ["cancelled", "no_show"];

const hm = (s: string | null) => (s ? s.slice(11, 16) : "");

export default function OmSlotPicker({ date, time, onChange, excludeId, rules, pickedLabel }: {
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm = เวลาเริ่มของช่วงที่เลือก · "" = ยังไม่เลือก */
  time: string;
  onChange: (date: string, time: string) => void;
  /** ใบงานตัวเอง — ไม่นับคิวของตัวเอง (เลื่อนภายในวันเดิมต้องไม่เห็นว่าเต็มเพราะตัวเอง) */
  excludeId?: number | null;
  /** ค่าในหน้าตั้งค่า O&M (มาพร้อม /api/om/follow) */
  rules?: Record<string, unknown>;
  /** หัวแถบสรุปเมื่อเลือกวันแล้ว เช่น "นัดเป็น" / "เลื่อนเป็น" */
  pickedLabel: string;
}) {
  // ผลโหลดผูกกับวันที่ขอ — เปลี่ยนวันแล้วถือว่ากำลังโหลดจนกว่าผลของวันใหม่จะมา (ไม่ต้อง setState ล้างค่าใน effect)
  const [loaded, setLoaded] = useState<{ date: string; slots: Slot[]; rows: Row[]; err: string } | null>(null);
  const ready = !!loaded && loaded.date === date;
  const slots = ready ? loaded.slots : null;
  const rows = ready ? loaded.rows : [];
  const err = ready ? loaded.err : "";
  const now = new Date();
  const today = now.toLocaleDateString("sv-SE");
  const nowHm = now.toTimeString().slice(0, 5);
  const num = (k: string, d: number) => (rules?.[k] != null && !Number.isNaN(Number(rules[k])) ? Number(rules[k]) : d);
  const maxDays = num("booking.advance_days_max", 60);
  const minHours = num("booking.advance_hours_min", 0);
  const lastDay = (() => { const d = new Date(); d.setDate(d.getDate() + maxDays); return d.toLocaleDateString("sv-SE"); })();
  const tooFar = !!date && date > lastDay;

  // ช่วงเวลาของวันที่เลือก + งานที่จองอยู่แล้ว — API เดียวกับปฏิทิน / จ่ายงาน
  useEffect(() => {
    if (!date) return;
    // กดเปลี่ยนวันเร็ว ๆ ยิงหลายคำขอ — ผลของวันเก่าที่มาทีหลังต้องไม่ทับ
    let live = true;
    apiFetch(`/api/om/bookings?from=${date}&to=${date}&size=200`)
      .then((d) => { if (live) setLoaded({ date, slots: d.slots ?? [], rows: d.rows ?? [], err: "" }); })
      .catch((e) => { if (live) setLoaded({ date, slots: [], rows: [], err: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
  }, [date]);

  const wd = date ? new Date(`${date}T00:00:00`).getDay() : -1;
  const daySlots = (slots ?? []).filter((s) => s.weekday === wd && s.is_open)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const booked = (s: Slot) => rows.filter((r) => r.id !== excludeId && !FREED.includes(r.status) && r.scheduled_at?.slice(0, 10) === date
    && hm(r.scheduled_at) >= s.start_time && hm(r.scheduled_at) < s.end_time).length;
  const picked = daySlots.find((s) => s.start_time === time);
  const tooSoon = !!(date && time && minHours > 0
    && new Date(`${date}T${time}:00`).getTime() - now.getTime() < minHours * 3600000);

  return (
    <div className="space-y-3">
      {/* หัวข้อของส่วนนี้ (เช่น "นัดเข้าบริการ" / "เลื่อนนัด") คนเรียกวางเองแบบ AppointmentRescheduler
          ปฏิทินฝั่งขายตัวเดิม — ดับเบิลคลิกวันที่เลือกอยู่ = ล้างวัน (พฤติกรรมของตัวนั้น) */}
      <div>
        <CalendarPicker date={date} timeSlot="" showTimeSlot={false}
          onDateChange={(d) => { if (d !== date) onChange(d, ""); }} onTimeSlotChange={() => {}} />

      {date && (
        // หัว "ช่วงเวลา" + เส้นคั่นชุดเดียวกับช่วงเวลาใน CalendarPicker
        <div className="mt-2 pt-2 border-t border-gray-100">
          <div className="text-xs font-semibold tracking-wider uppercase text-gray-400 mb-2">
            ช่วงเวลา<span className="ml-2 text-gray-300 normal-case font-normal">คิวที่ใช้ / ความจุ</span>
          </div>
          {err ? <div className="text-xs text-red-600">{err}</div>
            : slots === null ? <div className="text-xs text-gray-400">กำลังโหลดช่วงเวลา…</div>
            : !daySlots.length ? <div className="text-xs text-amber-700">วันนี้ไม่ใช่วันทำการตามตั้งค่าช่วงเวลา — เลือกวันอื่น</div>
            : (
              <>
                {tooFar && (
                  <div className="mb-2 text-xs text-amber-700">
                    เกินระยะนัดล่วงหน้า {maxDays} วันตามหน้าตั้งค่า — เลือกวันที่ไม่เกิน {formatThaiDate(lastDay)}
                  </div>
                )}
                {/* ตาราง 4 ช่องแบบช่วงเวลาของ CalendarPicker ฝั่งขาย · มือถือ 2 ช่อง (มีตัวเลขคิวต่อท้าย 4 ช่องแน่นเกิน) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                  {daySlots.map((s) => {
                    const n = booked(s), full = n >= s.capacity, on = time === s.start_time;
                    // ช่วงที่เริ่มไปแล้วเลือกไม่ได้ — API รับเฉพาะเวลาข้างหน้า (วันนัดเดิมที่เลยมาแล้วตอนเลื่อนนัดก็เช่นกัน)
                    const past = date < today || (date === today && s.start_time <= nowHm);
                    const off = past || tooFar;
                    return (
                      <button key={s.id} type="button" disabled={off} onClick={() => onChange(date, s.start_time)} style={{ minHeight: 0 }}
                        className={`flex items-center justify-center gap-1.5 h-8 px-1 rounded-md border transition-all ${on
                          ? "bg-active border-active text-white shadow-sm shadow-active/20"
                          : off
                          ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                          : "bg-white border-gray-300 text-gray-900 hover:border-active hover:text-active cursor-pointer"}`}>
                        <span className="text-[11px] md:text-xxs font-semibold font-mono tabular-nums">{s.start_time}–{s.end_time}</span>
                        <span className={`text-[11px] md:text-xxs font-semibold tabular-nums ${on ? "text-white/80" : off ? "" : full ? "text-red-600 font-bold" : "text-gray-400"}`}>{n}/{s.capacity}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
        </div>
      )}
      </div>

      {/* แถบสรุปวันเวลาที่เลือก — ยกจากแถบ "เลื่อนเป็น" ของ AppointmentRescheduler ฝั่งขาย (ขึ้นตั้งแต่เลือกวัน แบบตัวนั้น) */}
      {date && (
        <div className="rounded-lg bg-active-light border border-active/20 p-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-active shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-active/70">{pickedLabel}</div>
            <div className="text-sm font-bold text-active">
              {formatThaiDate(date, { weekday: true })}
              {time && <span className="ml-1.5 font-mono tabular-nums">{time}{picked && `–${picked.end_time}`}</span>}
            </div>
          </div>
        </div>
      )}
      {tooSoon && (
        <div className="text-xs font-semibold text-amber-700">
          ⚠ นัดล่วงหน้าไม่ถึง {minHours} ชม. ตามหน้าตั้งค่า — ยังบันทึกได้ ตรวจคิวทีมช่างก่อน
        </div>
      )}
    </div>
  );
}
