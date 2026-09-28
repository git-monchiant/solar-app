"use client";

// เลื่อนนัดใบงาน O&M จากหน้ารายละเอียด (ขั้นนัดหมาย) — แผน 20260928-04 ข้อ 8
// ★ หน้าตา/ลำดับยกจาก AppointmentRescheduler ของฝั่งขาย (หัวข้อ → เลือกวันเวลา → แถบ "เลื่อนเป็น" → ยกเลิก/ยืนยัน)
//   ใช้ตัวนั้นตรง ๆ ไม่ได้ เพราะ CalendarPicker ข้างในนับช่องว่างจากปฏิทินทีมสำรวจ/ติดตั้งของ lead
//   ส่วนงาน O&M ช่วงเวลา + ความจุมาจาก om_slot_config (ห้าม hardcode) — ชุดเดียวกับปฏิทิน / จ่ายงาน
// ★ บันทึกผ่าน PATCH /api/om/bookings/[id] { scheduled_at } ทางเดียวกับการลากในปฏิทิน
//   (API ลงประวัติ "เลื่อนนัด" + นับจำนวนครั้งที่เลื่อนให้เอง)
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { CheckIcon } from "@/components/ui/icons";
import { formatThaiDate } from "@/lib/utils/formatters";

type Slot = { id: number; weekday: number; start_time: string; end_time: string; capacity: number; is_open: number };
type Row = { id: number; scheduled_at: string | null; status: string };
// ใบที่ยกเลิก/ลูกค้าไม่อยู่บ้าน ไม่กินคิวของช่วงเวลา
const FREED = ["cancelled", "no_show"];

const hm = (s: string | null) => (s ? s.slice(11, 16) : "");

export default function OmRescheduler({ bookingId, currentAt, onCancel, onSaved }: {
  bookingId: number;
  currentAt: string | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(currentAt ? currentAt.slice(0, 10) : "");
  const [time, setTime] = useState(currentAt ? hm(currentAt) : "");
  const [reason, setReason] = useState("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // ช่วงเวลาของวันที่เลือก + งานที่จองอยู่แล้ว — API เดียวกับปฏิทิน / จ่ายงาน
  useEffect(() => {
    if (!date) return;
    setSlots(null);
    apiFetch(`/api/om/bookings?from=${date}&to=${date}&size=200`)
      .then((d) => { setSlots(d.slots ?? []); setRows(d.rows ?? []); })
      .catch((e) => { setErr(e instanceof Error ? e.message : String(e)); setSlots([]); });
  }, [date]);

  const wd = date ? new Date(`${date}T00:00:00`).getDay() : -1;
  const daySlots = (slots ?? []).filter((s) => s.weekday === wd && s.is_open)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  // นับคิวที่ใช้ไปของแต่ละช่วง ไม่นับใบงานตัวเอง (เลื่อนภายในวันเดิมต้องไม่เห็นว่าเต็มเพราะตัวเอง)
  const booked = (s: Slot) => rows.filter((r) => r.id !== bookingId && !FREED.includes(r.status) && r.scheduled_at?.slice(0, 10) === date
    && hm(r.scheduled_at) >= s.start_time && hm(r.scheduled_at) < s.end_time).length;

  const canSave = !!date && !!time && `${date}T${time}` !== (currentAt ? `${currentAt.slice(0, 10)}T${hm(currentAt)}` : "");

  const save = async () => {
    if (!canSave) return;
    setSaving(true); setErr("");
    try {
      await apiFetch(`/api/om/bookings/${bookingId}`, {
        method: "PATCH",
        body: JSON.stringify({ scheduled_at: `${date}T${time}`, reason: reason.trim() || null }),
      });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">เลื่อนนัด</div>

      <div className="rounded-lg bg-white/60 border border-active/15 p-3 space-y-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1.5">วันที่นัดใหม่</label>
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setTime(""); }}
            className="w-full md:w-64 h-8 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-active" />
        </div>

        {date && (
          <div>
            <label className="text-xs text-gray-500 block mb-1.5">ช่วงเวลา <span className="text-gray-400">· คิวที่ใช้ / ความจุ</span></label>
            {slots === null ? <div className="text-xs text-gray-400">กำลังโหลดช่วงเวลา…</div>
              : !daySlots.length ? <div className="text-xs text-amber-700">วันนี้ไม่ใช่วันทำการตามตั้งค่าช่วงเวลา — เลือกวันอื่น</div>
              : (
                <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                  {daySlots.map((s) => {
                    const n = booked(s), full = n >= s.capacity, on = time === s.start_time;
                    return (
                      // ★ ช่องเต็มยังกดได้ (แบบลากในปฏิทิน) แต่ตัวเลขขึ้นแดงให้เห็นก่อนตัดสินใจ
                      <button key={s.id} type="button" onClick={() => setTime(s.start_time)}
                        className={`h-8 px-2 rounded-lg text-xxs font-semibold border transition-all cursor-pointer ${on
                          ? "bg-active text-white border-active shadow-sm shadow-active/20"
                          : "bg-white text-gray-600 border-gray-200 hover:border-active/40 hover:text-active"}`}>
                        {s.start_time}–{s.end_time}
                        <span className={`ml-1 ${on ? "text-white/80" : full ? "text-red-600 font-bold" : "text-gray-400"}`}>{n}/{s.capacity}</span>
                      </button>
                    );
                  })}
                </div>
              )}
          </div>
        )}

        <div>
          <label className="text-xs text-gray-500 block mb-1.5">เหตุผลที่เลื่อน</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300}
            placeholder="เช่น ลูกค้าขอเลื่อน ไม่อยู่บ้านวันเดิม"
            className="w-full h-8 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-active" />
        </div>
      </div>

      {/* แถบ "เลื่อนเป็น" — ยกจาก AppointmentRescheduler */}
      {date && time && (
        <div className="rounded-lg bg-active-light border border-active/20 p-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-active shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-active/70">เลื่อนเป็น</div>
            <div className="text-sm font-bold text-active">
              {formatThaiDate(date)}<span className="ml-1.5 font-mono tabular-nums">{time}</span>
            </div>
          </div>
        </div>
      )}

      {err && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{err}</div>}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 h-11 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:border-gray-400 cursor-pointer">
          ยกเลิก
        </button>
        <button type="button" onClick={save} disabled={!canSave || saving}
          className="flex-[2] h-11 rounded-lg text-sm font-bold text-white bg-active hover:bg-active-dark disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-active/30 flex items-center justify-center gap-2 cursor-pointer">
          {saving ? "กำลังบันทึก…" : !date || !time ? "เลือกวันและเวลา" : !canSave ? "ยังเป็นวันเวลาเดิม" : (
            <><CheckIcon className="w-4 h-4" strokeWidth={2.5} />ยืนยันเลื่อนนัด</>
          )}
        </button>
      </div>
    </div>
  );
}
