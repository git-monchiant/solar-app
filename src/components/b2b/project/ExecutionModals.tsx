"use client";

import { useState } from "react";
import { PERMIT_STATUS_LABEL, type PermitStatus } from "@/lib/b2b/execution";
import ModalShell, { areaCls, fieldCls, labelCls, Req } from "./ModalShell";

// ป๊อปอัปขั้นดำเนินโครงการ (แผน 20261015-07 เฟส 4) — หน้าแม่ยิง API เอง (จัดการ error/saving)

type Common = { saving: boolean; error: string; onClose: () => void };
const todayIso = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);   // วันนี้ (เวลาไทย)
const FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";
const fileCls = "block w-full text-sm file:mr-3 file:h-9 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-200";

/** บันทึก milestone ใหม่ (แนบรูป/ไฟล์ได้หลายไฟล์) · edit = แก้วันที่/หมายเหตุของรายการเดิม (ไฟล์แก้ไม่ได้ — ยกเลิกแล้วบันทึกใหม่) */
export function MilestoneModal({ title, subtitle, initial, edit, saving, error, onConfirm, onClose }: Common & {
  title: string; subtitle?: string;
  initial?: { done_date: string; note: string | null };
  edit?: boolean;
  onConfirm: (v: { done_date: string; note: string; files: File[] }) => void;
}) {
  const [date, setDate] = useState(initial?.done_date ?? todayIso());
  const [note, setNote] = useState(initial?.note ?? "");
  const [files, setFiles] = useState<File[]>([]);
  return (
    <ModalShell title={title} subtitle={subtitle} confirmText={edit ? "บันทึก" : "บันทึกเหตุการณ์"} saving={saving} error={error}
      onClose={onClose} onConfirm={() => onConfirm({ done_date: date, note, files })}>
      <div className="max-w-[12rem]"><label className={labelCls}>วันที่ <Req /></label>
        <input type="date" className={fieldCls} value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></div>
      <div><label className={labelCls}>หมายเหตุ</label>
        <textarea rows={2} className={areaCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น แผงชุดแรก 600 แผง · ใบส่งของ DO-1234" /></div>
      {!edit && (
        <div><label className={labelCls}>รูปหน้างาน / เอกสาร (รูป หรือ PDF ไม่เกิน 10 ไฟล์ ไฟล์ละ 15 MB)</label>
          <input type="file" multiple accept={FILE_ACCEPT} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className={fileCls} />
          {files.length > 0 && <div className="mt-1 text-xs text-gray-500">เลือกแล้ว {files.length} ไฟล์</div>}
        </div>
      )}
    </ModalShell>
  );
}

const STATUSES: PermitStatus[] = ["pending", "submitted", "approved", "not_required"];

/** อัปเดตเรื่องขออนุญาต 1 อย่าง — สถานะ · วันยื่น · วันที่ได้ · เอกสาร (ไฟล์เดียว แนบใหม่ทับ) */
export function PermitModal({ title, initial, hasFile, saving, error, onConfirm, onClose }: Common & {
  title: string;
  initial: { status: PermitStatus; submitted_date: string | null; approved_date: string | null; note: string | null };
  hasFile: boolean;
  onConfirm: (v: { status: PermitStatus; submitted_date: string; approved_date: string; note: string; file: File | null }) => void;
}) {
  const [status, setStatus] = useState<PermitStatus>(initial.status);
  const [sub, setSub] = useState(initial.submitted_date ?? "");
  const [appr, setAppr] = useState(initial.approved_date ?? "");
  const [note, setNote] = useState(initial.note ?? "");
  const [file, setFile] = useState<File | null>(null);
  const pick = (s: PermitStatus) => {
    setStatus(s);
    if (s === "submitted" && !sub) setSub(todayIso());
    if (s === "approved" && !appr) setAppr(todayIso());
  };
  return (
    <ModalShell title={title} subtitle="บันทึกความคืบหน้า — ทำคู่ขนานกับจัดซื้อ/ติดตั้งได้" confirmText="บันทึก" saving={saving} error={error}
      onClose={onClose} onConfirm={() => onConfirm({ status, submitted_date: status === "pending" || status === "not_required" ? "" : sub, approved_date: status === "approved" ? appr : "", note, file })}>
      <div>
        <label className={labelCls}>สถานะ</label>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button key={s} type="button" onClick={() => pick(s)}
              className={`h-9 px-3 rounded-lg border text-sm font-semibold ${status === s ? "border-active bg-active-light text-active" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              {PERMIT_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      {(status === "submitted" || status === "approved") && (
        <div className="grid gap-3 md:grid-cols-2">
          <div><label className={labelCls}>วันที่ยื่น {status === "submitted" && <Req />}</label>
            <input type="date" className={fieldCls} value={sub} max={todayIso()} onChange={(e) => setSub(e.target.value)} /></div>
          {status === "approved" && (
            <div><label className={labelCls}>วันที่ได้ <Req /></label>
              <input type="date" className={fieldCls} value={appr} max={todayIso()} onChange={(e) => setAppr(e.target.value)} /></div>
          )}
        </div>
      )}
      <div><label className={labelCls}>หมายเหตุ</label>
        <input className={fieldCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น เลขที่รับเรื่อง · ผู้ประสานงานของการไฟฟ้า" /></div>
      <div><label className={labelCls}>เอกสาร (รูป หรือ PDF ไม่เกิน 15 MB){hasFile ? " — แนบใหม่ = แทนไฟล์เดิม" : ""}</label>
        <input type="file" accept={FILE_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={fileCls} /></div>
    </ModalShell>
  );
}
