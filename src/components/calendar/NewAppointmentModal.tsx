"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { HOURLY_SLOTS, parseSlots, serializeSlots, slotLabel } from "@/lib/time-slots";

type Zone = { id: number; name: string; color?: string | null };

// Quick-create modal for a non-lead "other work" calendar block — lets
// dispatch reserve a slot/day so survey/install scheduling sees it as taken.
// POSTs to /api/calendar-blocks. The /api/surveys/scheduled endpoint UNIONs
// these with lead appointments so date pickers automatically respect them.

export default function NewAppointmentModal({ onClose, onCreated, initialDate }: { onClose: () => void; onCreated: () => void; initialDate?: string }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string>(initialDate || new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>("");
  const [timeSlot, setTimeSlot] = useState<string>("");
  const [zone, setZone] = useState<string>("");
  const [zones, setZones] = useState<Zone[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/zones").then((zs: Zone[]) => {
      setZones(zs);
      if (zs.length > 0) setZone((cur) => cur || zs[0].name);
    }).catch(console.error);
  }, []);

  const save = async () => {
    if (!title.trim()) { setErr("กรอกชื่องาน"); return; }
    if (!date) { setErr("เลือกวันที่"); return; }
    setSaving(true); setErr(null);
    try {
      await apiFetch(`/api/calendar-blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          block_date: date,
          end_date: endDate && endDate > date ? endDate : null,
          time_slot: timeSlot || null,
          zone: zone || null,
          note: note.trim() || null,
        }),
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black/40 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="w-full md:max-w-lg bg-white rounded-t-2xl md:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="sticky top-0 bg-white px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">สร้างนัด (งานอื่น)</div>
            <div className="text-xs text-gray-500 mt-0.5">block วันให้ทีมนัดหมายไม่เลือก</div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">ชื่องาน</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น ประชุมทีม, ลาพักร้อน, ติดตั้งภายใน, ฯลฯ"
              className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">ทีม</label>
            <div className="flex flex-wrap gap-2">
              {zones.map((z) => {
                const selected = zone === z.name;
                const tint = z.color ?? undefined;
                return (
                  <button key={z.id} type="button" onClick={() => setZone(z.name)}
                    style={selected && tint ? { backgroundColor: tint, borderColor: tint, color: "#fff" } : tint ? { borderColor: tint, color: tint } : undefined}
                    className={`h-9 px-3 rounded-lg text-sm font-semibold border transition-colors ${selected && !tint ? "bg-primary text-white border-primary" : !tint ? "bg-white text-gray-600 border-gray-200 hover:border-gray-400" : "bg-white"}`}>
                    {z.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">วันเริ่ม</label>
              <input type="date" value={date}
                onChange={(e) => {
                  const v = e.target.value;
                  setDate(v);
                  if (endDate && endDate < v) setEndDate("");
                }}
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">
                วันสิ้นสุด
                <span className="ml-2 text-gray-300 normal-case font-normal">ไม่กรอก = วันเดียว</span>
              </label>
              <input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">
              ช่วงเวลา
              <span className="ml-2 text-gray-300 normal-case font-normal">เลือกได้มากกว่า 1 ช่วง</span>
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {HOURLY_SLOTS.map((s) => {
                const selected = parseSlots(timeSlot).includes(s);
                return (
                  <button key={s} type="button"
                    onClick={() => {
                      const cur = parseSlots(timeSlot);
                      const next = selected ? cur.filter((x) => x !== s) : [...cur, s].sort();
                      setTimeSlot(serializeSlots(next) || "");
                    }}
                    className={`flex items-center justify-center h-8 px-1 rounded-md border transition-all ${
                      selected
                        ? "bg-active border-active text-white shadow-sm shadow-active/20"
                        : "bg-white border-gray-300 text-gray-900 hover:border-active hover:text-active"
                    }`}>
                    <span className="text-[11px] font-semibold font-mono tabular-nums">{slotLabel(s)}</span>
                  </button>
                );
              })}
            </div>
            <div className="text-[11px] text-gray-400 mt-2">ไม่เลือกช่วงเวลา = block ทั้งวัน</div>
          </div>

          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">หมายเหตุ (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none" />
          </div>

          {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg py-2 text-center">{err}</div>}
        </div>

        <div className="sticky bottom-0 bg-white px-5 py-3 border-t border-gray-100 flex items-center gap-2">
          <button type="button" onClick={onClose}
            className="h-10 px-5 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50">
            ยกเลิก
          </button>
          <div className="flex-1" />
          <button type="button" onClick={save} disabled={saving || !title.trim()}
            className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}
