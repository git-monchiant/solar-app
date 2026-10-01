"use client";

// วันนัด + ช่วงเวลาของงาน O&M — แผน 20260929-03 ข้อ 1 · แผน 20261001-01 เฟส 3
// ★ ใช้ 3 ที่: ขั้น 01 ตกลงนัด · การ์ดนัดหมายตอนชำระเงินแล้ว · Reschedule (OmRescheduler)
// ★ 1 ต.ค. 69 ทีมสำรวจกับทีมล้างเป็นชุดเดียวกัน (ผู้ใช้เคาะ) ⇒ ตัวเลือกเดียวกับนัดสำรวจฝั่งขายทั้งก้อน
//   CalendarPicker เต็มตัว: ปฏิทิน 3 เดือน + 16 ช่อง 30 นาที เลือกหลายช่อง · ทำทุกวัน (เลิก om_slot_config)
//   overlap="warn" = เห็นนัดสำรวจ/ติดตั้ง/O&M เป็นจุด แต่ไม่ล็อก (ผู้ใช้เคาะ "นัดทับกันได้") · ปิดช่อง (calendar_blocks) ยังล็อก
//   เลือกทับนัดอื่น → CalendarPicker ขึ้นเตือนเหลืองว่าทับนัดอะไร
// ★ ค่าที่ได้ = วัน + time_slot (JSON array แบบ leads.survey_time_slot) — API คิดเวลาเริ่มจากช่องแรกเอง
// ★ กติกาหน้าตั้งค่า O&M (booking.advance_days_max · booking.advance_hours_min)
//   ไกลเกิน advance_days_max = วันกดไม่ได้ · ใกล้กว่า advance_hours_min = เตือนเฉย ๆ ไม่บล็อก
//   ช่องที่เริ่มไปแล้วของวันนี้กดไม่ได้ — API รับเฉพาะเวลาข้างหน้า (เลื่อนนัด)
import CalendarPicker from "@/components/calendar/CalendarPicker";
import { formatThaiDate } from "@/lib/utils/formatters";
import { formatSlotsRange, parseSlots } from "@/lib/time-slots";

export default function OmSlotPicker({ date, slot, onDateChange, onSlotChange, excludeId, rules, pickedLabel }: {
  /** YYYY-MM-DD · "" = ยังไม่เลือก */
  date: string;
  /** ช่องที่เลือก (JSON array) · "" = ยังไม่เลือก */
  slot: string;
  // แยกสองตัวตาม CalendarPicker — ตัวนั้นเรียกต่อกันในคลิกเดียวได้ (เปลี่ยนวันแล้วตัดช่องที่ถูกปิด)
  onDateChange: (date: string) => void;
  onSlotChange: (slot: string) => void;
  /** ใบงานตัวเอง — ไม่นับเป็นนัดทับ (เลื่อนภายในวันเดิม) */
  excludeId?: number | null;
  /** ค่าในหน้าตั้งค่า O&M (มาพร้อม /api/om/follow) */
  rules?: Record<string, unknown>;
  /** หัวแถบสรุปเมื่อเลือกวันแล้ว เช่น "นัดเป็น" / "เลื่อนเป็น" */
  pickedLabel: string;
}) {
  const now = new Date();
  const today = now.toLocaleDateString("sv-SE");
  const nowHm = now.toTimeString().slice(0, 5);
  const num = (k: string, d: number) => (rules?.[k] != null && !Number.isNaN(Number(rules[k])) ? Number(rules[k]) : d);
  const maxDays = num("booking.advance_days_max", 60);
  const minHours = num("booking.advance_hours_min", 0);
  const lastDay = (() => { const d = new Date(); d.setDate(d.getDate() + maxDays); return d.toLocaleDateString("sv-SE"); })();
  const first = parseSlots(slot).sort()[0] ?? "";
  const tooSoon = !!(date && first && minHours > 0
    && new Date(`${date}T${first}:00`).getTime() - now.getTime() < minHours * 3600000);

  return (
    <div className="space-y-3">
      {/* หัวข้อของส่วนนี้ (เช่น "นัดเข้าบริการ" / "เลื่อนนัด") คนเรียกวางเองแบบ AppointmentRescheduler
          ดับเบิลคลิกวันที่เลือกอยู่ = ล้างวันและช่วงเวลา (พฤติกรรมของ CalendarPicker) */}
      <CalendarPicker
        date={date}
        timeSlot={slot}
        onDateChange={onDateChange}
        onTimeSlotChange={onSlotChange}
        showTimeSlot
        showSurveySlots
        teamContext="survey"
        overlap="warn"
        excludeOmBookingId={excludeId ?? null}
        maxDate={lastDay}
        slotDisabled={(d, s) => d < today || (d === today && s <= nowHm)}
      />

      {/* แถบสรุปวันเวลาที่เลือก — แถบ "เลื่อนเป็น" ของ AppointmentRescheduler ฝั่งขาย */}
      {date && (
        <div className="rounded-lg bg-active-light border border-active/20 p-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-active shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-active/70">{pickedLabel}</div>
            <div className="text-sm font-bold text-active">
              {formatThaiDate(date, { weekday: true })}
              {slot && <span className="ml-1.5 font-mono tabular-nums">{formatSlotsRange(slot)}</span>}
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
