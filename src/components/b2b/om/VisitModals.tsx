"use client";

import { useState } from "react";
import Dropdown from "@/components/ui/Dropdown";
import type { B2bUserOption } from "@/lib/b2b/project";
import { todayThIso } from "@/lib/b2b/om";
import ModalShell, { areaCls, fieldCls, labelCls, Req } from "@/components/b2b/project/ModalShell";

// ป๊อปอัปของ O&M B2B (แผน 20261015-09) — หน้าแม่ยิง API เอง (จัดการ error/saving) · โครงเดียวกับป๊อปอัปหน้าโครงการ B2B

type Common = { saving: boolean; error: string; onClose: () => void };
const FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";
const fileCls = "block w-full text-sm file:mr-3 file:h-9 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-200";

/** นัด / เลื่อนนัดครั้งเข้างาน — วันต้องอยู่ในอายุสัญญา (API ตรวจซ้ำ) */
export function ScheduleVisitModal({ title, initial, minDate, maxDate, users, reschedule, saving, error, onConfirm, onClose }: Common & {
  title: string;
  initial: { scheduled_date: string | null; days: number | null; lead_user_id: number | null; schedule_note: string | null; due_date: string };
  minDate: string; maxDate: string; users: B2bUserOption[]; reschedule: boolean;
  onConfirm: (v: { scheduled_date: string; days: number; lead_user_id: number | null; note: string; reason: string }) => void;
}) {
  const [date, setDate] = useState(initial.scheduled_date ?? "");
  const [days, setDays] = useState(String(initial.days ?? 1));
  const [lead, setLead] = useState(initial.lead_user_id ? String(initial.lead_user_id) : "");
  const [note, setNote] = useState(initial.schedule_note ?? "");
  const [reason, setReason] = useState("");
  return (
    <ModalShell title={title} subtitle={reschedule ? "เลื่อนได้ไม่จำกัดภายในอายุสัญญา" : "ล้างแผง + ตรวจระบบ — นัดกับผู้ประสานงานของลูกค้า"}
      confirmText={reschedule ? "เลื่อนนัด" : "บันทึกนัด"} saving={saving} error={error} onClose={onClose}
      onConfirm={() => onConfirm({ scheduled_date: date, days: Number(days) || 1, lead_user_id: Number(lead) || null, note, reason })}>
      <div className="grid gap-3 md:grid-cols-[1fr_7rem]">
        <div><label className={labelCls}>วันเข้างาน <Req /></label>
          <input type="date" className={fieldCls} value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label className={labelCls}>จำนวนวัน</label>
          <input type="number" min={1} max={14} className={`${fieldCls} text-right`} value={days} onChange={(e) => setDays(e.target.value)} /></div>
      </div>
      <div><label className={labelCls}>ผู้รับผิดชอบ</label>
        <Dropdown value={lead} onChange={setLead} placeholder="ไม่ระบุ" options={users.map((u) => ({ value: String(u.id), label: u.full_name }))} /></div>
      <div><label className={labelCls}>หมายเหตุนัด</label>
        <input className={fieldCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ทีม 4 คน · เข้าทางประตู 2 · ขอปิดระบบ 08:00–12:00" /></div>
      {reschedule && (
        <div><label className={labelCls}>เหตุผลที่เลื่อน</label>
          <input className={fieldCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ลูกค้าขอเลื่อน — โรงงานมีตรวจประจำปี" /></div>
      )}
    </ModalShell>
  );
}

/** ปิดครั้งเข้างาน — เฟส 1 แนบรายงาน/รูปอย่างน้อย 1 ไฟล์ (ใบตรวจบนมือถือมาในเฟส 2) */
export function CloseVisitModal({ title, initialDate, saving, error, onConfirm, onClose }: Common & {
  title: string; initialDate: string | null;
  onConfirm: (v: { done_date: string; note: string; files: File[] }) => void;
}) {
  const today = todayThIso();
  const [date, setDate] = useState(initialDate && initialDate <= today ? initialDate : today);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  return (
    <ModalShell title={title} subtitle="แนบรายงานบริการ / รูปก่อน-หลัง อย่างน้อย 1 ไฟล์" confirmText="ปิดงาน" saving={saving} error={error}
      onClose={onClose} onConfirm={() => onConfirm({ done_date: date, note, files })}>
      <div className="max-w-[12rem]"><label className={labelCls}>วันที่เข้างาน <Req /></label>
        <input type="date" className={fieldCls} value={date} max={today} onChange={(e) => setDate(e.target.value)} /></div>
      <div><label className={labelCls}>ผลการตรวจ / หมายเหตุ</label>
        <textarea rows={3} className={areaCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ล้างแผงครบ 1,368 แผง · Inverter ปกติทุกตัว · String 3 ของ INV-2 ค่าต่ำ นัดตรวจซ้ำ" /></div>
      <div><label className={labelCls}>รายงาน / รูปหน้างาน <Req /> (รูป หรือ PDF ไม่เกิน 20 ไฟล์ ไฟล์ละ 15 MB)</label>
        <input type="file" multiple accept={FILE_ACCEPT} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className={fileCls} />
        {files.length > 0 && <div className="mt-1 text-xs text-gray-500">เลือกแล้ว {files.length} ไฟล์</div>}
      </div>
    </ModalShell>
  );
}

/** สร้างสัญญา O&M เอง (หน้าโครงการ) — ใบไม่ได้ใส่ O&M / ส่งมอบแล้วแต่ยังไม่ปิดโครงการ */
export function CreateContractModal({ initial, saving, error, onConfirm, onClose }: Common & {
  initial: { years: number | null; visits_per_year: number | null; start_date: string | null };
  onConfirm: (v: { years: number; visits_per_year: number; start_date: string }) => void;
}) {
  const [years, setYears] = useState(String(initial.years || 2));
  const [perYear, setPerYear] = useState(String(initial.visits_per_year || 2));
  const [start, setStart] = useState(initial.start_date ?? todayThIso());
  const total = (Number(years) || 0) * (Number(perYear) || 0);
  return (
    <ModalShell title="สร้างสัญญา O&M" subtitle="ตารางเข้างานสร้างล่วงหน้าทั้งสัญญา กระจายเท่ากันนับจากวันเริ่ม" confirmText="สร้างสัญญา"
      saving={saving} error={error} onClose={onClose}
      onConfirm={() => onConfirm({ years: Number(years) || 0, visits_per_year: Number(perYear) || 0, start_date: start })}>
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <div><label className={labelCls}>จำนวนปี <Req /></label>
          <input type="number" min={1} max={30} className={`${fieldCls} text-right`} value={years} onChange={(e) => setYears(e.target.value)} /></div>
        <div><label className={labelCls}>ครั้งต่อปี <Req /></label>
          <input type="number" min={1} max={24} className={`${fieldCls} text-right`} value={perYear} onChange={(e) => setPerYear(e.target.value)} /></div>
        <div className="col-span-2 md:col-span-1"><label className={labelCls}>วันเริ่มสัญญา <Req /></label>
          <input type="date" className={fieldCls} value={start} onChange={(e) => setStart(e.target.value)} /></div>
      </div>
      <p className="text-xs text-gray-500">รวม <b className="text-gray-800">{total > 0 ? total : "—"}</b> ครั้ง · ปกติเริ่มนับวันส่งมอบงาน</p>
    </ModalShell>
  );
}
