"use client";

import { useState } from "react";
import Dropdown from "@/components/ui/Dropdown";
import type { B2bCustomer, B2bUserOption } from "@/lib/b2b/project";
import ModalShell, { areaCls, fieldCls, labelCls, Req } from "./ModalShell";

// ป๊อปอัปการกระทำในหน้าโครงการ — ส่งค่าให้หน้าแม่ยิง /api/b2b/projects/[id]/actions (หน้าแม่จัดการ error/saving)

type Common = { saving: boolean; error: string; onClose: () => void };

/** ถามเหตุผล — แพ้งาน / ยกเลิก / ถอยขั้น / เปิดกลับ */
export function ReasonModal({ title, subtitle, label, placeholder, required = true, confirmText, danger, saving, error, onConfirm, onClose }: Common & {
  title: string; subtitle?: string; label: string; placeholder?: string; required?: boolean; confirmText: string; danger?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <ModalShell title={title} subtitle={subtitle} confirmText={confirmText} confirmTone={danger ? "danger" : "primary"}
      saving={saving} error={error} onClose={onClose} onConfirm={() => onConfirm(reason)}>
      <label className={labelCls}>{label} {required && <Req />}</label>
      <textarea autoFocus rows={3} className={areaCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} />
    </ModalShell>
  );
}

const todayIso = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);   // วันนี้ (เวลาไทย)

/** นัด / เลื่อนนัดสำรวจ */
export function ScheduleSurveyModal({ initialDate, initialSurveyor, users, saving, error, onConfirm, onClose }: Common & {
  initialDate: string | null; initialSurveyor: number | null; users: B2bUserOption[];
  onConfirm: (v: { survey_date: string; surveyor_id: number | null; note: string }) => void;
}) {
  const [date, setDate] = useState(initialDate ?? "");
  const [surveyor, setSurveyor] = useState(initialSurveyor ? String(initialSurveyor) : "");
  const [note, setNote] = useState("");
  return (
    <ModalShell title={initialDate ? "เลื่อนนัดสำรวจ" : "นัดสำรวจหน้างาน"} subtitle="โครงการจะอยู่ขั้นสำรวจจนกว่าจะบันทึกผล"
      confirmText="บันทึกนัด" saving={saving} error={error} onClose={onClose}
      onConfirm={() => onConfirm({ survey_date: date, surveyor_id: Number(surveyor) || null, note })}>
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className={labelCls}>วันนัดสำรวจ <Req /></label>
          <input type="date" className={fieldCls} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label className={labelCls}>ผู้สำรวจ</label>
          <Dropdown value={surveyor} onChange={setSurveyor} placeholder="ไม่ระบุ" options={users.map((u) => ({ value: String(u.id), label: u.full_name }))} /></div>
      </div>
      <div><label className={labelCls}>หมายเหตุนัด</label>
        <input className={fieldCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น นัดคุณ… ฝ่ายวิศวกรรม 09:30 ที่ป้อม รปภ." /></div>
    </ModalShell>
  );
}

/** บันทึกผลสำรวจ → ขั้นราคายืนยัน */
export function RecordSurveyModal({ initialDate, saving, error, onConfirm, onClose }: Common & {
  initialDate: string | null;
  onConfirm: (v: { survey_date: string; note: string }) => void;
}) {
  const [date, setDate] = useState(initialDate && initialDate <= todayIso() ? initialDate : todayIso());
  const [note, setNote] = useState("");
  return (
    <ModalShell title="บันทึกผลสำรวจ" subtitle="บันทึกแล้วโครงการไปขั้นราคายืนยัน — ทำ BOQ Rev ใหม่ตามหน้างานจริง" width="max-w-2xl"
      confirmText="บันทึกผล" saving={saving} error={error} onClose={onClose} onConfirm={() => onConfirm({ survey_date: date, note })}>
      <div className="max-w-xs"><label className={labelCls}>วันที่สำรวจจริง <Req /></label>
        <input type="date" className={fieldCls} value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></div>
      <div><label className={labelCls}>สรุปผลสำรวจ <Req /></label>
        <textarea autoFocus rows={5} className={areaCls} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="ชนิดหลังคา · พื้นที่ใช้ได้ · จุดเชื่อมต่อ/ตู้ MDB · อุปสรรคหน้างาน · สิ่งที่ต้องแก้ใน BOQ" /></div>
      <p className="text-xs text-gray-400">รูป/ไฟล์ผลสำรวจ — แนบในขั้นถัดไปของงาน (ยังไม่มีในเฟสนี้)</p>
    </ModalShell>
  );
}

/** แก้ข้อมูลบริษัทลูกค้า — กระทบทุกโครงการของบริษัทนี้ */
export function CustomerEditModal({ initial, projectCount, saving, error, onConfirm, onClose }: Common & {
  initial: B2bCustomer; projectCount?: number;
  onConfirm: (v: { name: string; tax_id: string; branch: string; address: string }) => void;
}) {
  const [v, setV] = useState({ name: initial.name, tax_id: initial.tax_id ?? "", branch: initial.branch ?? "", address: initial.address ?? "" });
  return (
    <ModalShell title="แก้ข้อมูลบริษัทลูกค้า" subtitle={projectCount && projectCount > 1 ? `ใช้ร่วม ${projectCount} โครงการ — แก้แล้วเห็นทุกโครงการ` : "แก้แล้วทุกโครงการของบริษัทนี้เห็นค่าใหม่"}
      confirmText="บันทึก" saving={saving} error={error} onClose={onClose} onConfirm={() => onConfirm(v)}>
      <div><label className={labelCls}>ชื่อบริษัท <Req /></label>
        <input autoFocus className={fieldCls} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
      <div className="grid gap-3 md:grid-cols-12">
        <div className="md:col-span-7"><label className={labelCls}>เลขประจำตัวผู้เสียภาษี</label>
          <input inputMode="numeric" className={fieldCls} value={v.tax_id} onChange={(e) => setV({ ...v, tax_id: e.target.value })} placeholder="13 หลัก" /></div>
        <div className="md:col-span-5"><label className={labelCls}>สาขา</label>
          <input className={fieldCls} value={v.branch} onChange={(e) => setV({ ...v, branch: e.target.value })} /></div>
      </div>
      <div><label className={labelCls}>ที่อยู่ (ออกเอกสาร)</label>
        <textarea rows={2} className={areaCls} value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></div>
    </ModalShell>
  );
}

/** BOQ ตัวเลือกใหม่ของโครงการ */
export function NewBoqModal({ saving, error, onConfirm, onClose }: Common & {
  onConfirm: (v: { option_label: string; margin_pct: string }) => void;
}) {
  const [label, setLabel] = useState("");
  const [margin, setMargin] = useState("15");
  return (
    <ModalShell title="เพิ่ม BOQ ตัวเลือกใหม่" subtitle="ได้เลขที่ BOQ ใหม่ (Rev 0) แล้วไปเติมรายการในหน้าทำ BOQ"
      confirmText="สร้าง BOQ" saving={saving} error={error} onClose={onClose} onConfirm={() => onConfirm({ option_label: label, margin_pct: margin })}>
      <div><label className={labelCls}>ชื่อตัวเลือก</label>
        <input autoFocus className={fieldCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="เช่น 998.64 kWp · Jinko 730" /></div>
      <div className="max-w-[12rem]"><label className={labelCls}>Margin (% ของราคาขาย)</label>
        <input type="number" step="0.01" min={0} max={99} className={`${fieldCls} text-right`} value={margin} onChange={(e) => setMargin(e.target.value)} /></div>
    </ModalShell>
  );
}
