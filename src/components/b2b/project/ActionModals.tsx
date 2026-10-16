"use client";

import { useState } from "react";
import Dropdown from "@/components/ui/Dropdown";
import BoqSourceField from "@/components/b2b/boq/BoqSourceField";
import type { B2bCustomer, B2bProjectBoq, B2bProjectQuote, B2bUserOption } from "@/lib/b2b/project";
import { formatTHB } from "@/lib/utils/formatters";
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

const FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,application/pdf";
const fileCls = "block w-full text-sm file:mr-3 file:h-9 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-200";

/** บันทึกผลสำรวจ → ขั้นราคายืนยัน · แนบรูป/ไฟล์ไปพร้อมกันได้ (แผน 20261015-10 — แนบเพิ่มทีหลังที่การ์ดขั้น 03 ได้) */
export function RecordSurveyModal({ initialDate, saving, error, onConfirm, onClose }: Common & {
  initialDate: string | null;
  onConfirm: (v: { survey_date: string; note: string; files: File[] }) => void;
}) {
  const [date, setDate] = useState(initialDate && initialDate <= todayIso() ? initialDate : todayIso());
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  return (
    <ModalShell title="บันทึกผลสำรวจ" subtitle="บันทึกแล้วโครงการไปขั้นราคายืนยัน — ทำ BOQ Rev ใหม่ตามหน้างานจริง" width="max-w-2xl"
      confirmText="บันทึกผล" saving={saving} error={error} onClose={onClose} onConfirm={() => onConfirm({ survey_date: date, note, files })}>
      <div className="max-w-xs"><label className={labelCls}>วันที่สำรวจจริง <Req /></label>
        <input type="date" className={fieldCls} value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></div>
      <div><label className={labelCls}>สรุปผลสำรวจ <Req /></label>
        <textarea autoFocus rows={5} className={areaCls} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="ชนิดหลังคา · พื้นที่ใช้ได้ · จุดเชื่อมต่อ/ตู้ MDB · อุปสรรคหน้างาน · สิ่งที่ต้องแก้ใน BOQ" /></div>
      <div><label className={labelCls}>รูป/ไฟล์ผลสำรวจ (รูป หรือ PDF ไม่เกิน 20 ไฟล์ ไฟล์ละ 15 MB)</label>
        <input type="file" multiple accept={FILE_ACCEPT} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className={fileCls} />
        {files.length > 0 && <div className="mt-1 text-xs text-gray-500">เลือกแล้ว {files.length} ไฟล์</div>}
      </div>
    </ModalShell>
  );
}

/** แนบรูป/ไฟล์ของโครงการ (ผลสำรวจ) — ต่อท้ายไฟล์เดิม */
export function AttachFilesModal({ title, saving, error, onConfirm, onClose }: Common & {
  title: string;
  onConfirm: (v: { files: File[]; note: string }) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  return (
    <ModalShell title={title} subtitle="รูป หรือ PDF ไม่เกิน 20 ไฟล์ ไฟล์ละ 15 MB — ต่อท้ายไฟล์เดิม" confirmText="แนบไฟล์" saving={saving} error={error}
      onClose={onClose} onConfirm={() => onConfirm({ files, note })}>
      <div><label className={labelCls}>ไฟล์ <Req /></label>
        <input type="file" multiple accept={FILE_ACCEPT} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className={fileCls} />
        {files.length > 0 && <div className="mt-1 text-xs text-gray-500">เลือกแล้ว {files.length} ไฟล์</div>}
      </div>
      <div><label className={labelCls}>หมายเหตุ</label>
        <input className={fieldCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น แบบหลังคาจากลูกค้า · รูปตู้ MDB อาคาร B" /></div>
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

/** ใบเสนอราคาใหม่ — เลือก BOQ ตัวเลือก (Rev ล่าสุด) · ชนิดใบตามขั้นของโครงการ (server ตั้งเอง) */
export function NewQuoteModal({ boqs, kindLabel, saving, error, onConfirm, onClose }: Common & {
  boqs: B2bProjectBoq[]; kindLabel: string;
  onConfirm: (boqId: number) => void;
}) {
  const [boqId, setBoqId] = useState(boqs.length === 1 ? String(boqs[0].id) : "");
  const picked = boqs.find((b) => String(b.id) === boqId);
  return (
    <ModalShell title={`สร้างใบเสนอราคา${kindLabel}`} subtitle="รายการเหมา · งวดเงิน · รับประกัน · หมายเหตุ ตั้งต้นตามแม่แบบ SSE แก้ได้ก่อนส่งอนุมัติ"
      confirmText="สร้างใบเสนอราคา" saving={saving} error={error} onClose={onClose} onConfirm={() => onConfirm(Number(boqId))}>
      <div><label className={labelCls}>เสนอจาก BOQ <Req /></label>
        <Dropdown value={boqId} onChange={setBoqId} placeholder={boqs.length ? "เลือก BOQ ตัวเลือก" : "ยังไม่มี BOQ — เพิ่ม BOQ ก่อน"}
          options={boqs.map((b) => ({ value: String(b.id), label: `${b.option_label || b.doc_no} · ${b.doc_no} Rev ${b.revision}` }))} /></div>
      {picked && (
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
          {picked.capacity_wp ? `${formatTHB(picked.capacity_wp / 1000, { decimals: 2 })} kWp · ` : ""}ราคาขาย BOQ {picked.total_sale ? formatTHB(picked.total_sale, { decimals: 0 }) : "—"} บาท (ก่อน VAT)
          {picked.pending_lines > 0 && <div className="mt-1 text-xs font-semibold text-red-600">มีบรรทัดรอราคา {picked.pending_lines} — สร้างใบได้ แต่ส่งอนุมัติไม่ได้จนกว่า Purchase ใส่ราคาครบ</div>}
        </div>
      )}
    </ModalShell>
  );
}

/** ได้งาน — เลือกใบที่ส่งลูกค้าแล้ว 1 ใบ (กลายเป็นสัญญา) · เลข PO/สัญญา + วันลงนาม ใส่ทีหลังได้ (เฟส 3) */
export function WonModal({ quotes, saving, error, onConfirm, onClose }: Common & {
  quotes: B2bProjectQuote[];
  onConfirm: (v: { quote_id: number; contract_no: string; contract_date: string | null }) => void;
}) {
  const [quoteId, setQuoteId] = useState(quotes.length === 1 ? String(quotes[0].id) : "");
  const [no, setNo] = useState("");
  const [date, setDate] = useState("");
  const picked = quotes.find((q) => String(q.id) === quoteId);
  return (
    <ModalShell title="ได้งาน" subtitle="ใบที่เลือกกลายเป็นสัญญา · BOQ ของใบ = งบโครงการ · ใบอื่นของโครงการปิดเอง · งวด 1 ถึงกำหนดทันที" width="max-w-xl"
      confirmText="บันทึกได้งาน" saving={saving} error={error} onClose={onClose}
      onConfirm={() => onConfirm({ quote_id: Number(quoteId), contract_no: no, contract_date: date || null })}>
      <div><label className={labelCls}>ใบเสนอราคาที่ลูกค้าตอบรับ <Req /></label>
        <Dropdown value={quoteId} onChange={setQuoteId} placeholder={quotes.length ? "เลือกใบ" : "ยังไม่มีใบที่ส่งลูกค้า"}
          options={quotes.map((q) => ({ value: String(q.id), label: `${q.doc_no} Rev ${q.revision} · ${q.option_label || q.boq_doc_no} · ${formatTHB(q.subtotal, { decimals: 0 })} บาท` }))} /></div>
      {picked && <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">มูลค่าสัญญา {formatTHB(picked.subtotal, { decimals: 2 })} บาท (ก่อน VAT) · รวม VAT {formatTHB(picked.total, { decimals: 2 })}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className={labelCls}>เลข PO / สัญญา</label>
          <input className={fieldCls} value={no} onChange={(e) => setNo(e.target.value)} placeholder="ใส่ทีหลังได้" /></div>
        <div><label className={labelCls}>วันลงนาม</label>
          <input type="date" className={fieldCls} value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
    </ModalShell>
  );
}

/** บันทึก/แก้สัญญาหลังได้งาน */
export function ContractModal({ initialNo, initialDate, saving, error, onConfirm, onClose }: Common & {
  initialNo: string | null; initialDate: string | null;
  onConfirm: (v: { contract_no: string; contract_date: string }) => void;
}) {
  const [no, setNo] = useState(initialNo ?? "");
  const [date, setDate] = useState(initialDate ?? "");
  return (
    <ModalShell title="บันทึกสัญญา / PO" confirmText="บันทึก" saving={saving} error={error} onClose={onClose}
      onConfirm={() => onConfirm({ contract_no: no, contract_date: date })}>
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className={labelCls}>เลข PO / สัญญา</label>
          <input autoFocus className={fieldCls} value={no} onChange={(e) => setNo(e.target.value)} /></div>
        <div><label className={labelCls}>วันลงนาม <Req /></label>
          <input type="date" className={fieldCls} value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
    </ModalShell>
  );
}

/** แนบหลักฐานรับเงินงวด — รูปหรือ PDF ไฟล์เดียว · บัญชียืนยันในหน้าเดียวกัน */
export function EvidenceModal({ title, saving, error, onConfirm, onClose }: Common & {
  title: string;
  onConfirm: (v: { file: File | null; received_date: string; note: string }) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  return (
    <ModalShell title={title} subtitle="ส่งให้บัญชียืนยัน — สลิปโอน / หนังสือรับเงิน / ใบรับเช็ค (รูป หรือ PDF ไม่เกิน 15 MB)"
      confirmText="ส่งให้บัญชี" saving={saving} error={error} onClose={onClose} onConfirm={() => onConfirm({ file, received_date: date, note })}>
      <div><label className={labelCls}>ไฟล์หลักฐาน <Req /></label>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:h-9 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-200" /></div>
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className={labelCls}>วันที่ลูกค้าชำระ <Req /></label>
          <input type="date" className={fieldCls} value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <div><label className={labelCls}>หมายเหตุถึงบัญชี</label>
        <input className={fieldCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น โอนเข้าบัญชี TTB · หักภาษี ณ ที่จ่าย 3%" /></div>
    </ModalShell>
  );
}

/** BOQ ตัวเลือกใหม่ของโครงการ — เริ่มจากใบเปล่า หรือคัดลอกจากใบอื่น (แผน 20261016-02 · Margin ตั้งตามใบต้นทาง แก้ได้) */
export function NewBoqModal({ projectId, saving, error, onConfirm, onClose }: Common & {
  projectId: number;
  onConfirm: (v: { option_label: string; margin_pct: string; copy_from: string }) => void;
}) {
  const [label, setLabel] = useState("");
  const [margin, setMargin] = useState("15");
  const [source, setSource] = useState("");
  return (
    <ModalShell title="เพิ่ม BOQ ตัวเลือกใหม่" subtitle="ได้เลขที่ BOQ ใหม่ (Rev 0) แล้วไปเติมรายการในหน้าทำ BOQ"
      confirmText="สร้าง BOQ" saving={saving} error={error} onClose={onClose} onConfirm={() => onConfirm({ option_label: label, margin_pct: margin, copy_from: source })}>
      <BoqSourceField projectId={projectId} value={source} labelCls={labelCls}
        onChange={(v, row) => { setSource(v); if (row?.margin_pct != null) setMargin(String(row.margin_pct)); }} />
      <div><label className={labelCls}>ชื่อตัวเลือก</label>
        <input autoFocus className={fieldCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="เช่น 998.64 kWp · Jinko 730" /></div>
      <div className="max-w-[12rem]"><label className={labelCls}>Margin (% ของราคาขาย)</label>
        <input type="number" step="0.01" min={0} max={99} className={`${fieldCls} text-right`} value={margin} onChange={(e) => setMargin(e.target.value)} /></div>
    </ModalShell>
  );
}
