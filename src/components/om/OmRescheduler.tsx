"use client";

// เลื่อนนัดใบงาน O&M จากหน้ารายละเอียด (ขั้นนัดหมาย) — แผน 20260928-04 ข้อ 8
// ★ หน้าตา/ลำดับยกจาก AppointmentRescheduler ของฝั่งขาย (หัวข้อ → เลือกวันเวลา → แถบ "เลื่อนเป็น" → ยกเลิก/ยืนยัน)
//   ใช้ตัวนั้นตรง ๆ ไม่ได้ เพราะ CalendarPicker ข้างในนับช่องว่างจากปฏิทินทีมสำรวจ/ติดตั้งของ lead
//   ส่วนงาน O&M ช่วงเวลา + ความจุมาจาก om_slot_config (ห้าม hardcode) — ชุดเดียวกับปฏิทิน / จ่ายงาน
// ★ บันทึกผ่าน POST /api/om/bookings/[id]/reschedule — ใช้กติกา "การเลื่อนนัด" ในหน้าตั้งค่า O&M
//   (กลับเป็นรอยืนยัน · ปลดทีม · แจ้ง LINE · เกินเพดานแค่เตือน — ผู้ใช้เคาะ 28 ก.ย. 69 ข้อ 4 ข)
//   GET ของ endpoint เดียวกันบอกล่วงหน้าว่ากดแล้วจะเกิดอะไร ให้คนกดเห็นก่อนยืนยัน
// ★ การลากในปฏิทินยังใช้ PATCH เดิม ไม่มีผลตามมา (เครื่องมือจัดคิวของคนจ่ายงาน)
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { CheckIcon } from "@/components/ui/icons";
import { formatThaiDate } from "@/lib/utils/formatters";
import { teamLabel } from "@/lib/om/service-view";

type Slot = { id: number; weekday: number; start_time: string; end_time: string; capacity: number; is_open: number };
type Row = { id: number; scheduled_at: string | null; status: string };
type Preview = {
  team_name: string | null; rescheduled_count: number; line_links: number; line_enabled: boolean;
  warnings: string[];
  will: { to_pending: boolean; clear_team: boolean; notify_line: boolean };
  rules: { notify_line: boolean };
};
// ใบที่ยกเลิก/ลูกค้าไม่อยู่บ้าน ไม่กินคิวของช่วงเวลา
const FREED = ["cancelled", "no_show"];

const hm = (s: string | null) => (s ? s.slice(11, 16) : "");
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function OmRescheduler({ bookingId, currentAt, onCancel, onSaved }: {
  bookingId: number;
  currentAt: string | null;
  onCancel: () => void;
  /** เลื่อนสำเร็จ — ส่งข้อความสรุปผล (รวมผลแจ้ง LINE) ให้หน้าที่ฝังขึ้น toast */
  onSaved: (msg: string) => void;
}) {
  const [date, setDate] = useState(currentAt ? currentAt.slice(0, 10) : "");
  const [time, setTime] = useState(currentAt ? hm(currentAt) : "");
  const [reason, setReason] = useState("");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const today = ymd(new Date());
  const nowHm = new Date().toTimeString().slice(0, 5);

  // ผลที่จะเกิดเมื่อยืนยัน + คำเตือนเกินเพดาน — ตามค่าในหน้าตั้งค่า ณ ตอนเปิดฟอร์ม
  useEffect(() => {
    apiFetch(`/api/om/bookings/${bookingId}/reschedule`).then(setPreview).catch(() => setPreview(null));
  }, [bookingId]);

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
      const r: { line: { enabled: boolean; linked: number; sent: number } } = await apiFetch(`/api/om/bookings/${bookingId}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ scheduled_at: `${date}T${time}`, reason: reason.trim() || null }),
      });
      // บอกผลแจ้ง LINE ตามจริง — ผูกไว้แต่ส่งไม่ออก (เช่น LINE ยังไม่เปิดใช้) ต้องไม่เงียบ
      const line = !r.line.linked ? ""
        : r.line.sent === r.line.linked ? " · แจ้งลูกค้าทาง LINE แล้ว"
        : !r.line.enabled ? " · LINE ยังไม่เปิดใช้ — ไม่ได้แจ้งลูกค้า"
        : ` · แจ้ง LINE ได้ ${r.line.sent}/${r.line.linked} บัญชี`;
      onSaved(`เลื่อนนัดแล้ว${line}`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">เลื่อนนัด</div>

      <div className="rounded-lg bg-white/60 border border-active/15 p-3 space-y-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1.5">วันที่นัดใหม่</label>
          <input type="date" value={date} min={today} onChange={(e) => { setDate(e.target.value); setTime(""); }}
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
                    // ช่วงที่เริ่มไปแล้วของวันนี้เลือกไม่ได้ — API รับเฉพาะเวลาข้างหน้า
                    const past = date === today && s.start_time <= nowHm;
                    return (
                      // ★ ช่องเต็มยังกดได้ (แบบลากในปฏิทิน) แต่ตัวเลขขึ้นแดงให้เห็นก่อนตัดสินใจ
                      <button key={s.id} type="button" disabled={past} onClick={() => setTime(s.start_time)}
                        className={`h-8 px-2 rounded-lg text-xxs font-semibold border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${on
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

      {/* ผลที่จะเกิดเมื่อยืนยัน — มาจากหน้าตั้งค่า O&M › กติกา › การเลื่อนนัด (บอกก่อนกด ไม่ให้ทีมหลุดแบบไม่รู้ตัว) */}
      {preview && (preview.will.to_pending || preview.will.clear_team || preview.rules.notify_line || preview.warnings.length > 0) && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-xs text-gray-700 space-y-1">
          <div className="font-semibold text-gray-500">เมื่อยืนยันเลื่อนนัด</div>
          {preview.will.to_pending && <div>• ใบงานกลับเป็น <b>รอยืนยันนัด</b> — ตกลงวันใหม่กับลูกค้าแล้วกด &quot;ลูกค้ายืนยันแล้ว&quot; อีกครั้ง</div>}
          {preview.will.clear_team && preview.team_name && <div>• ปลด <b>{teamLabel(preview.team_name)}</b> ออก — จ่ายทีมใหม่ที่ขั้นนี้หรือในปฏิทิน</div>}
          {preview.rules.notify_line && (preview.will.notify_line
            ? <div>• แจ้งลูกค้าทาง LINE ({preview.line_links} บัญชีที่ผูกบ้านนี้){!preview.line_enabled && <span className="text-amber-700"> — LINE ยังไม่เปิดใช้ จะยังไม่ส่งจริง</span>}</div>
            : <div className="text-gray-500">• บ้านนี้ยังไม่ผูก LINE — ไม่ได้แจ้งลูกค้า โทรแจ้งเอง</div>)}
          {preview.warnings.map((w) => (
            <div key={w} className="text-amber-700 font-semibold">⚠ {w} — ทีมงานเลื่อนต่อได้ ระบบจดไว้ในประวัติ</div>
          ))}
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
