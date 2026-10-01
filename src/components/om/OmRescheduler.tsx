"use client";

// เลื่อนนัดใบงาน O&M จากหน้ารายละเอียด (ขั้นนัดหมาย) — แผน 20260928-04 ข้อ 8
// ★ หน้าตา/ลำดับยกจาก AppointmentRescheduler ของฝั่งขาย (หัวข้อ → เลือกวันเวลา → แถบ "เลื่อนเป็น" → ยกเลิก/ยืนยัน)
//   ใช้ตัวนั้นตรง ๆ ไม่ได้ เพราะ CalendarPicker ข้างในนับช่องว่างจากปฏิทินทีมสำรวจ/ติดตั้งของ lead
//   ส่วนงาน O&M ช่วงเวลา + ความจุมาจาก om_slot_config (ห้าม hardcode) — ชุดเดียวกับปฏิทิน / จ่ายงาน
// ★ บันทึกผ่าน POST /api/om/bookings/[id]/reschedule — ใช้กติกา "การเลื่อนนัด" ในหน้าตั้งค่า O&M
//   (กลับเป็นรอยืนยัน · แจ้ง LINE · เกินเพดานแค่เตือน — ผู้ใช้เคาะ 28 ก.ย. 69 ข้อ 4 ข · ปลดทีมเลิกแล้ว 1 ต.ค. 69)
//   GET ของ endpoint เดียวกันบอกล่วงหน้าว่ากดแล้วจะเกิดอะไร ให้คนกดเห็นก่อนยืนยัน
// ★ การลากในปฏิทินยังใช้ PATCH เดิม ไม่มีผลตามมา (เครื่องมือจัดคิวของคนจ่ายงาน)
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { CheckIcon } from "@/components/ui/icons";
// ★ วัน + ช่วงเวลา ย้ายไป OmSlotPicker (แผน 20260929-03) — ใช้ร่วมกับฟอร์มโทรตกลงนัด
import OmSlotPicker from "@/components/om/OmSlotPicker";

type Preview = {
  team_name: string | null; rescheduled_count: number; line_links: number; line_enabled: boolean;
  warnings: string[];
  will: { to_pending: boolean; clear_team: boolean; notify_line: boolean };
  rules: { notify_line: boolean };
};

export default function OmRescheduler({ bookingId, currentAt, currentSlot, rules, onCancel, onSaved }: {
  bookingId: number;
  currentAt: string | null;
  /** ช่องที่จองอยู่ (JSON array · แผน 20261001-01) — เริ่มฟอร์มด้วยช่องเดิม */
  currentSlot?: string | null;
  /** ค่าในหน้าตั้งค่า O&M — ช่วงวัน/ระยะล่วงหน้าของตัวเลือกวัน */
  rules?: Record<string, unknown>;
  onCancel: () => void;
  /** เลื่อนสำเร็จ — ส่งข้อความสรุปผล (รวมผลแจ้ง LINE) ให้หน้าที่ฝังขึ้น toast */
  onSaved: (msg: string) => void;
}) {
  const [date, setDate] = useState(currentAt ? currentAt.slice(0, 10) : "");
  const [slot, setSlot] = useState(currentSlot ?? "");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // ผลที่จะเกิดเมื่อยืนยัน + คำเตือนเกินเพดาน — ตามค่าในหน้าตั้งค่า ณ ตอนเปิดฟอร์ม
  useEffect(() => {
    apiFetch(`/api/om/bookings/${bookingId}/reschedule`).then(setPreview).catch(() => setPreview(null));
  }, [bookingId]);

  // เลื่อนได้เมื่อวันหรือช่องต่างจากเดิม — วันเดิมแต่เพิ่ม/ลดช่องก็นับ (API ใช้กติกาเดียวกัน)
  const canSave = !!date && !!slot && (date !== (currentAt?.slice(0, 10) ?? "") || slot !== (currentSlot ?? ""));

  const save = async () => {
    if (!canSave) return;
    setSaving(true); setErr("");
    try {
      const r: { line: { enabled: boolean; linked: number; sent: number } } = await apiFetch(`/api/om/bookings/${bookingId}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ scheduled_at: date, time_slot: slot, reason: reason.trim() || null }),
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
        <OmSlotPicker date={date} slot={slot} excludeId={bookingId} rules={rules} pickedLabel="เลื่อนเป็น"
          onDateChange={setDate} onSlotChange={setSlot} />

        <div>
          <label className="text-xs text-gray-500 block mb-1.5">เหตุผลที่เลื่อน</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300}
            placeholder="เช่น ลูกค้าขอเลื่อน ไม่อยู่บ้านวันเดิม"
            className="w-full h-8 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-active" />
        </div>
      </div>

      {/* ผลที่จะเกิดเมื่อยืนยัน — มาจากหน้าตั้งค่า O&M › กติกา › การเลื่อนนัด (บอกก่อนกด ไม่ให้ทีมหลุดแบบไม่รู้ตัว) */}
      {preview && (preview.will.to_pending || preview.rules.notify_line) && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-xs text-gray-700 space-y-1">
          <div className="font-semibold text-gray-500">เมื่อยืนยันเลื่อนนัด</div>
          {preview.will.to_pending && <div>• ใบงานกลับเป็น <b>รอยืนยันนัด</b> — ตกลงวันใหม่กับลูกค้าแล้วกด &quot;ลูกค้ายืนยันแล้ว&quot; อีกครั้ง</div>}
          {preview.rules.notify_line && (preview.will.notify_line
            ? <div>• แจ้งลูกค้าทาง LINE ({preview.line_links} บัญชีที่ผูกบ้านนี้){!preview.line_enabled && <span className="text-amber-700"> — LINE ยังไม่เปิดใช้ จะยังไม่ส่งจริง</span>}</div>
            : <div className="text-gray-500">• บ้านนี้ยังไม่ผูก LINE — ไม่ได้แจ้งลูกค้า โทรแจ้งเอง</div>)}
          {/* ★ 1 ต.ค. 69 ผู้ใช้สั่งเอาเตือนเกินเพดาน (เลื่อนเกินกี่ครั้ง / ใกล้นัดเดิม) ออกจากจอ — API ยังจดไว้ในประวัติเหมือนเดิม */}
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
          {saving ? "กำลังบันทึก…" : !date || !slot ? "เลือกวันและเวลา" : !canSave ? "ยังเป็นวันเวลาเดิม" : (
            <><CheckIcon className="w-4 h-4" strokeWidth={2.5} />ยืนยันเลื่อนนัด</>
          )}
        </button>
      </div>
    </div>
  );
}
