"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { HOURLY_SLOTS, parseSlots, serializeSlots, slotLabel } from "@/lib/time-slots";
import ModalBase from "@/components/ui/ModalBase";

type TeamPick = "survey" | "install" | "both";

// Quick-create modal for a non-lead "other work" calendar block — lets
// dispatch reserve a slot/day so survey/install scheduling sees it as taken.
// POSTs to /api/calendar-blocks. The /api/surveys/scheduled endpoint UNIONs
// these with lead appointments so date pickers automatically respect them.

export default function NewAppointmentModal({ onClose, onCreated, initialDate }: { onClose: () => void; onCreated: () => void; initialDate?: string }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string>(initialDate || new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>("");
  const [timeSlot, setTimeSlot] = useState<string>("");
  const [allDay, setAllDay] = useState<boolean>(true);
  const [team, setTeam] = useState<TeamPick>("both");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
          time_slot: allDay ? null : (timeSlot || null),
          team: team === "both" ? null : team,
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
    <ModalBase
      title={
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
          </span>
          <div>
            <div className="text-sm font-bold">สร้างนัด (งานอื่น)</div>
            <div className="text-xs text-gray-500 mt-0.5 font-normal">block วันให้ทีมนัดหมายไม่เลือก</div>
          </div>
        </div>
      }
      onClose={onClose}
      size="lg"
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white">
            ยกเลิก
          </button>
          <button type="button" onClick={save} disabled={saving || !title.trim()}
            className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 active:bg-primary-dark transition-colors">
            {saving ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
          <div>
            <label className="text-xs font-bold tracking-wider uppercase text-gray-400 block mb-1.5">ชื่องาน</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น ประชุมทีม, ลาพักร้อน, ติดตั้งภายใน, ฯลฯ"
              className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
          </div>

          <div>
            <label className="text-xs font-bold tracking-wider uppercase text-gray-400 block mb-1.5">ทีม</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "survey" as const, label: "ทีม Survey", color: "#1ed0c7" },
                { value: "install" as const, label: "ทีม Solar", color: "#f97316" },
                { value: "both" as const, label: "ทั้ง 2 ทีม", color: "#6b7280" },
              ].map((opt) => {
                const selected = team === opt.value;
                return (
                  <button key={opt.value} type="button" onClick={() => setTeam(opt.value)}
                    style={selected ? { backgroundColor: opt.color, borderColor: opt.color, color: "#fff" } : { borderColor: opt.color, color: opt.color }}
                    className="h-9 px-3 rounded-lg text-sm font-semibold border bg-white transition-colors">
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold tracking-wider uppercase text-gray-400 block mb-1.5">วันเริ่ม</label>
              <input type="date" value={date}
                onChange={(e) => {
                  const v = e.target.value;
                  setDate(v);
                  if (endDate && endDate < v) setEndDate("");
                }}
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-bold tracking-wider uppercase text-gray-400 block mb-1.5">
                วันสิ้นสุด
                <span className="ml-2 text-gray-300 normal-case font-normal">ไม่กรอก = วันเดียว</span>
              </label>
              <input type="date" value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold tracking-wider uppercase text-gray-400">
                ช่วงเวลา
                <span className="ml-2 text-gray-300 normal-case font-normal">เลือกได้มากกว่า 1 ช่วง</span>
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => {
                    setAllDay(e.target.checked);
                    if (e.target.checked) setTimeSlot("");
                  }}
                  className="w-4 h-4 accent-primary"
                />
                ทั้งวัน
              </label>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {HOURLY_SLOTS.map((s) => {
                const selected = allDay || parseSlots(timeSlot).includes(s);
                return (
                  <button key={s} type="button"
                    onClick={() => {
                      // Clicking a slot exits "ทั้งวัน" mode automatically. If
                      // we were in all-day, treat the click as "carve out this
                      // one hour"; otherwise toggle normally.
                      const base = allDay ? [...HOURLY_SLOTS] : parseSlots(timeSlot);
                      const next = selected ? base.filter((x) => x !== s) : [...base, s].sort();
                      setAllDay(false);
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
          </div>

          <div>
            <label className="text-xs font-bold tracking-wider uppercase text-gray-400 block mb-1.5">หมายเหตุ (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none" />
          </div>

          {err && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{err}</div>}
      </div>
    </ModalBase>
  );
}
