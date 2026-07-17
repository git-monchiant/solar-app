"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { StepCommonProps } from "./types";
import FallbackImage from "@/components/ui/FallbackImage";
import ErrorPopup from "@/components/ui/ErrorPopup";
import DoneSection from "./DoneSection";
import StepLayout from "../StepLayout";
import { compressImage } from "@/lib/utils/compressImage";
import { useFileViewer } from "@/lib/hooks/useFileViewer";

type ApplicantType = "individual" | "juristic";
type ChecklistStatus = "missing" | "received" | "needs_fix";

interface ChecklistEntry {
  status: ChecklistStatus;
  note: string;
  required?: boolean;
}

type ChecklistState = Record<string, ChecklistEntry>;

interface ChecklistItem {
  id: string;
  label: string;
  detail: string;
  conditional?: boolean;
}

const COMMON_ITEMS: ChecklistItem[] = [
  { id: "power_of_attorney", label: "หนังสือมอบอำนาจ", detail: "ลงนามในช่องผู้มอบอำนาจตามเอกสารแนบ" },
  { id: "latest_electricity_bill", label: "สำเนาใบแจ้งค่าไฟเดือนล่าสุด", detail: "ชื่อผู้มอบอำนาจต้องตรงกับชื่อในใบแจ้งค่าไฟ" },
];

const INDIVIDUAL_ITEMS: ChecklistItem[] = [
  { id: "id_card", label: "สำเนาบัตรประชาชน", detail: "ชื่อผู้มอบอำนาจต้องตรงกับชื่อในใบแจ้งค่าไฟ" },
  { id: "house_registration", label: "สำเนาทะเบียนบ้าน", detail: "ชื่อผู้มอบอำนาจต้องตรงกับชื่อในใบแจ้งค่าไฟ" },
  { id: "post_solar_house_registration", label: "สำเนาทะเบียนบ้านหลังติดตั้ง Solar", detail: "เอกสารเพิ่มเติม กรณีลูกค้ายังไม่ย้ายทะเบียนบ้าน", conditional: true },
];

const JURISTIC_ITEMS: ChecklistItem[] = [
  { id: "company_certificate", label: "หนังสือรับรองบริษัท อายุไม่เกิน 3 เดือน", detail: "ลงนามกรรมการผู้มีอำนาจและประทับตราบริษัท" },
  { id: "director_id_card", label: "สำเนาบัตรประชาชนของกรรมการผู้ลงนาม", detail: "กรรมการผู้มีอำนาจลงนาม" },
  { id: "director_house_registration", label: "สำเนาทะเบียนบ้านของกรรมการผู้ลงนาม", detail: "กรรมการผู้มีอำนาจลงนาม" },
  { id: "post_solar_house_registration", label: "สำเนาทะเบียนบ้านหลังติดตั้ง Solar", detail: "เอกสารเพิ่มเติม กรณีลูกค้ายังไม่ย้ายทะเบียนบ้าน", conditional: true },
];

const TAX_CONSENT: ChecklistItem = {
  id: "tax_measure_consent",
  label: "หนังสือยินยอมเข้าร่วมโครงการมาตรการทางภาษี",
  detail: "ฉบับที่ 805 พ.ศ. 2569 ตามเอกสารแนบ (เฉพาะ MEA)",
};

function getChecklistItems(utility: string, applicantType: string): ChecklistItem[] {
  if (!utility || !applicantType) return [];
  const applicantItems = applicantType === "juristic" ? JURISTIC_ITEMS : INDIVIDUAL_ITEMS;
  const powerAttorney = applicantType === "juristic"
    ? { ...COMMON_ITEMS[0], detail: "ลงนามกรรมการผู้มีอำนาจและประทับตราบริษัท" }
    : COMMON_ITEMS[0];
  const items = [powerAttorney, ...(utility === "MEA" ? [TAX_CONSENT] : []), COMMON_ITEMS[1], ...applicantItems];
  return items.map(item => ({ ...item, id: `${utility}:${applicantType}:${item.id}` }));
}

function parseChecklist(value: string | null): ChecklistState {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

interface Props extends StepCommonProps {
  expanded?: boolean;
  onToggle?: () => void;
}

export default function GridTieStep({ lead, state, refresh, expanded, onToggle }: Props) {
  const fileViewer = useFileViewer();
  const [utility, setUtility] = useState(lead.grid_utility || "");
  const [appNo, setAppNo] = useState(lead.grid_app_no || "");
  const [applicantType, setApplicantType] = useState<ApplicantType | "">(
    lead.grid_applicant_type === "individual" || lead.grid_applicant_type === "juristic" ? lead.grid_applicant_type : "",
  );
  const [checklist, setChecklist] = useState<ChecklistState>(() => parseChecklist(lead.grid_document_checklist));
  const [note, setNote] = useState(lead.grid_note || "");
  const [applicationDocUrl, setApplicationDocUrl] = useState<string | null>(lead.grid_application_doc_url);
  const [permitUrl, setPermitUrl] = useState<string | null>(lead.grid_permit_doc_url);
  const [uploadingApplicationDoc, setUploadingApplicationDoc] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);
  const checklistItems = useMemo(() => getChecklistItems(utility, applicantType), [utility, applicantType]);

  // Auto-save
  useEffect(() => {
    if (state !== "active") return;
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grid_utility: utility || null,
          grid_app_no: appNo || null,
          grid_applicant_type: applicantType || null,
          grid_document_checklist: Object.keys(checklist).length > 0 ? JSON.stringify(checklist) : null,
          grid_note: note || null,
        }),
      }).catch(console.error);
    }, 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utility, appNo, applicantType, checklist, note]);

  const updateChecklistItem = (id: string, patch: Partial<ChecklistEntry>) => {
    setChecklist(current => {
      const entry = current[id] || { status: "missing", note: "" };
      return { ...current, [id]: { ...entry, ...patch } };
    });
  };

  const uploadApplicationDoc = async (file: File) => {
    setUploadingApplicationDoc(true);
    try {
      const compressed = await compressImage(file).catch(() => file);
      const fd = new FormData();
      fd.append("file", compressed);
      fd.append("filename", `gridtie_application_${lead.id}`);
      const res = await apiFetch("/api/upload", { method: "POST", body: fd });
      if (res.url) {
        setApplicationDocUrl(res.url);
        await apiFetch(`/api/leads/${lead.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grid_application_doc_url: res.url }),
        });
      }
    } finally { setUploadingApplicationDoc(false); }
  };

  const removeApplicationDoc = async () => {
    setApplicationDocUrl(null);
    await apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grid_application_doc_url: null }),
    });
  };

  const uploadPermit = async (file: File) => {
    setUploading(true);
    try {
      const compressed = await compressImage(file).catch(() => file);
      const fd = new FormData();
      fd.append("file", compressed);
      fd.append("filename", `gridtie_permit_${lead.id}`);
      const res = await apiFetch("/api/upload", { method: "POST", body: fd });
      if (res.url) {
        setPermitUrl(res.url);
        await apiFetch(`/api/leads/${lead.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grid_permit_doc_url: res.url }),
        });
      }
    } finally { setUploading(false); }
  };

  const removePermit = async () => {
    setPermitUrl(null);
    await apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grid_permit_doc_url: null }),
    });
  };

  const closeJob = async () => {
    const missing: string[] = [];
    if (!permitUrl) missing.push("ใบอนุญาต/PPA");
    if (missing.length > 0) { setNextError(missing.join(", ")); return; }

    setClosing(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      await refresh();
    } finally { setClosing(false); }
  };

  const renderDoneContent = () => (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <Info label="การไฟฟ้า" value={lead.grid_utility} />
        <Info label="เลขที่คำขอ" value={lead.grid_app_no} mono />
        <Info label="ประเภทผู้ยื่น" value={applicantType === "individual" ? "บุคคลธรรมดา" : applicantType === "juristic" ? "นิติบุคคล" : null} />
      </div>
      {checklistItems.length > 0 && <ChecklistDoneSummary items={checklistItems} value={checklist} />}
      {lead.grid_application_doc_url && (
        <a href={lead.grid_application_doc_url} onClick={fileViewer.handler(lead.grid_application_doc_url, "เอกสารยื่นขอขนานไฟ")}
           className="flex items-center justify-center gap-2 w-full h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-700">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          ดูเอกสารยื่นขอขนานไฟ
        </a>
      )}
      {lead.grid_permit_doc_url && (
        <a href={lead.grid_permit_doc_url} onClick={fileViewer.handler(lead.grid_permit_doc_url, "ใบอนุญาต / PPA")}
           className="flex items-center justify-center gap-2 w-full h-8 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-700">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          ดูใบอนุญาต
        </a>
      )}
      {lead.grid_note && (
        <DoneSection color="gray" title="หมายเหตุ">
          <div className="text-sm text-gray-800 whitespace-pre-wrap">{lead.grid_note}</div>
        </DoneSection>
      )}
    </>
  );

  return (
    <StepLayout
      state={state}
      expanded={expanded}
      onToggle={onToggle}
      doneHeader={<span className="text-sm font-semibold text-emerald-700">ขนานไฟสำเร็จ</span>}
      renderDone={renderDoneContent}
      overlay={fileViewer.modal}
    >
    <div className="space-y-3">
      {/* Utility + App No */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">การไฟฟ้า</label>
          <select value={utility} onChange={e => setUtility(e.target.value)}
            className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-primary">
            <option value="">— เลือก —</option>
            <option value="MEA">MEA (นครหลวง)</option>
            <option value="PEA">PEA (ส่วนภูมิภาค)</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">เลขที่คำขอ</label>
          <input value={appNo} onChange={e => setAppNo(e.target.value)} placeholder="XXX-XXXX"
            className="w-full h-11 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-primary" />
        </div>
      </div>

      {/* Applicant type */}
      <div>
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">ประเภทผู้ยื่น</label>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
          <button type="button" onClick={() => setApplicantType("individual")}
            className={`h-9 rounded-md text-sm font-semibold transition-colors ${applicantType === "individual" ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            บุคคลธรรมดา
          </button>
          <button type="button" onClick={() => setApplicantType("juristic")}
            className={`h-9 rounded-md text-sm font-semibold transition-colors ${applicantType === "juristic" ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            นิติบุคคล
          </button>
        </div>
      </div>

      {utility && applicantType ? (
        <ChecklistPanel items={checklistItems} value={checklist} utility={utility} onChange={updateChecklistItem} />
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center">
          <div className="text-sm font-semibold text-gray-600">เลือกการไฟฟ้าและประเภทผู้ยื่น</div>
          <div className="text-xs text-gray-400 mt-1">ระบบจะแสดง Checklist เอกสารที่ต้องใช้ให้ตรงกับงาน</div>
        </div>
      )}

      {/* Grid-tie application document upload */}
      <div>
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">เอกสารยื่นขอขนานไฟ</label>
        {applicationDocUrl ? (
          <div className="relative">
            {applicationDocUrl.match(/\.(pdf)$/i) ? (
              <a href={applicationDocUrl} onClick={fileViewer.handler(applicationDocUrl, "เอกสารยื่นขอขนานไฟ")} className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
                <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M14,2H6C4.9,2 4,2.9 4,4V20C4,21.1 4.9,22 6,22H18C19.1,22 20,21.1 20,20V8L14,2M18,20H6V4H13V9H18V20Z" /></svg>
                <span className="text-sm text-gray-700 flex-1">เอกสารยื่นขอขนานไฟ.pdf</span>
              </a>
            ) : (
              <FallbackImage src={applicationDocUrl} alt="เอกสารยื่นขอขนานไฟ" className="max-h-40 max-w-full object-contain bg-gray-50 rounded-lg border border-gray-200 hover:opacity-80 transition" />
            )}
            <button onClick={removeApplicationDoc} aria-label="ลบเอกสารยื่นขอขนานไฟ" className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full text-white flex items-center justify-center text-xs" style={{ minHeight: 0 }}>✕</button>
          </div>
        ) : (
          <label className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 transition-colors ${uploadingApplicationDoc ? "cursor-wait opacity-60" : "hover:border-primary cursor-pointer"}`}>
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <span className="text-sm text-gray-500">{uploadingApplicationDoc ? "กำลังอัปโหลด..." : "อัปโหลดเอกสารยื่นขอขนานไฟ"}</span>
            <input type="file" accept="image/*,.pdf" disabled={uploadingApplicationDoc} className="hidden" onChange={e => e.target.files?.[0] && uploadApplicationDoc(e.target.files[0])} />
          </label>
        )}
      </div>

      {/* Permit / PPA upload */}
      <div>
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">ใบอนุญาต / PPA</label>
        {permitUrl ? (
          <div className="relative">
            {permitUrl.match(/\.(pdf)$/i) ? (
              <a href={permitUrl} onClick={fileViewer.handler(permitUrl, "ใบอนุญาต / PPA")} className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
                <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M14,2H6C4.9,2 4,2.9 4,4V20C4,21.1 4.9,22 6,22H18C19.1,22 20,21.1 20,20V8L14,2M18,20H6V4H13V9H18V20Z" /></svg>
                <span className="text-sm text-gray-700 flex-1">ใบอนุญาต.pdf</span>
              </a>
            ) : (
              <FallbackImage src={permitUrl} alt="" className="max-h-40 max-w-full object-contain bg-gray-50 rounded-lg border border-gray-200 hover:opacity-80 transition" />
            )}
            <button onClick={removePermit} className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full text-white flex items-center justify-center text-xs" style={{ minHeight: 0 }}>✕</button>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 hover:border-primary cursor-pointer transition-colors">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <span className="text-sm text-gray-500">{uploading ? "กำลังอัปโหลด..." : "อัปโหลดใบอนุญาต/PPA"}</span>
            <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => e.target.files?.[0] && uploadPermit(e.target.files[0])} />
          </label>
        )}
      </div>

      {/* Note */}
      <div>
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">หมายเหตุ</label>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="เช่น โซน, เจ้าหน้าที่ติดต่อ..."
          className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-primary resize-none" />
      </div>

      {/* Close */}
      <button type="button" onClick={closeJob} disabled={closing}
        className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:brightness-110 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        {closing ? "กำลังปิดงาน..." : "ปิดงาน — ขนานไฟเสร็จสิ้น"}
      </button>

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
    </div>
    </StepLayout>
  );
}

function ChecklistPanel({ items, value, utility, onChange }: {
  items: ChecklistItem[];
  value: ChecklistState;
  utility: string;
  onChange: (id: string, patch: Partial<ChecklistEntry>) => void;
}) {
  const requiredItems = items.filter(item => !item.conditional || value[item.id]?.required);
  const receivedCount = requiredItems.filter(item => value[item.id]?.status === "received").length;
  const complete = requiredItems.length > 0 && receivedCount === requiredItems.length;

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5A3.375 3.375 0 0010.125 2.25H8.25m0 12.75h7.5m-7.5 3h4.5m-1.5-15.75H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V10.5a8.25 8.25 0 00-8.25-8.25z" /></svg>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Checklist เอกสารลูกค้า</div>
            <div className="text-xxs text-gray-400 mt-0.5">{utility} · ตรวจรับเอกสารก่อนจัดชุดยื่นขอขนานไฟ</div>
          </div>
        </div>
        <div className={`rounded-full px-2.5 py-1 text-xs font-bold ${complete ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>
          {receivedCount}/{requiredItems.length} ได้รับแล้ว
        </div>
      </div>

      <div className="border-b border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
        ชื่อผู้มอบอำนาจต้องตรงกับใบแจ้งค่าไฟ กรุณาลงนามเฉพาะช่องผู้มอบอำนาจ ส่วนรายละเอียดอื่นบริษัทเป็นผู้กรอก
      </div>

      <div className="divide-y divide-gray-100">
        {items.map((item, index) => {
          const entry = value[item.id] || { status: "missing" as const, note: "" };
          const isRequired = !item.conditional || entry.required === true;
          const isReceived = entry.status === "received";
          return (
            <div key={item.id} className={`grid grid-cols-1 gap-2 px-3 py-2.5 md:grid-cols-[minmax(280px,1fr)_minmax(230px,300px)_minmax(180px,0.75fr)] md:items-center ${isRequired ? "bg-white" : "bg-gray-50/70"}`}>
              <div className="min-w-0">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 text-xs font-bold ${isRequired ? "text-gray-400" : "text-gray-300"}`}>{index + 1}.</span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`text-sm font-semibold ${isRequired ? "text-gray-800" : "text-gray-400"}`}>{item.label}</span>
                      {item.conditional && <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-xxs font-semibold text-blue-600">ตามเงื่อนไข</span>}
                    </div>
                    <div className={`mt-0.5 text-xs ${isRequired ? "text-gray-500" : "text-gray-400"}`}>{item.detail}</div>
                  </div>
                </div>
                {item.conditional && (
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-600">
                    <input type="checkbox" checked={isRequired} onChange={event => onChange(item.id, { required: event.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
                    จำเป็นสำหรับงานนี้
                  </label>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={!isRequired} onClick={() => onChange(item.id, { status: "received" })}
                  className={`h-9 rounded-lg border text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${isReceived && isRequired ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-emerald-300"}`}>
                  ได้รับแล้ว
                </button>
                <button type="button" disabled={!isRequired} onClick={() => onChange(item.id, { status: "missing" })}
                  className={`h-9 rounded-lg border text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${!isReceived && isRequired ? "border-red-500 bg-red-500 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-red-300"}`}>
                  ยังไม่ได้รับ
                </button>
              </div>

              <input value={entry.note} disabled={!isRequired} onChange={event => onChange(item.id, { note: event.target.value })}
                aria-label={`หมายเหตุ ${item.label}`} placeholder="หมายเหตุ"
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 placeholder:text-gray-300 focus:outline-none focus:border-primary disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-50" />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ChecklistDoneSummary({ items, value }: { items: ChecklistItem[]; value: ChecklistState }) {
  const visibleItems = items.filter(item => !item.conditional || value[item.id]?.required);
  const receivedCount = visibleItems.filter(item => value[item.id]?.status === "received").length;
  return (
    <DoneSection color="gray" title={`Checklist เอกสาร · ${receivedCount}/${visibleItems.length} ได้รับแล้ว`}>
      <div className="space-y-1.5">
        {visibleItems.map(item => {
          const entry = value[item.id] || { status: "missing" as const, note: "" };
          return (
            <div key={item.id} className="flex items-start gap-2 text-xs">
              <span className={entry.status === "received" ? "text-emerald-600" : "text-gray-400"}>
                {entry.status === "received" ? "✓" : "○"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-gray-700">{item.label}</div>
                  <span className={`font-semibold ${entry.status === "received" ? "text-emerald-600" : "text-gray-400"}`}>
                    {entry.status === "received" ? "ได้รับแล้ว" : "ยังไม่ได้รับ"}
                  </span>
                </div>
                {entry.note && <div className="text-gray-400 mt-0.5">{entry.note}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </DoneSection>
  );
}

function Info({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-200 p-2">
      <div className="text-xxs font-bold uppercase tracking-wider text-gray-400 mb-0.5">{label}</div>
      <div className={`text-sm font-semibold text-gray-800 ${mono ? "font-mono" : ""}`}>{value || "—"}</div>
    </div>
  );
}
