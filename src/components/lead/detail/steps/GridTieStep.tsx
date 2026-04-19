"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { StepCommonProps } from "./types";
import FallbackImage from "@/components/ui/FallbackImage";
import ErrorPopup from "@/components/ui/ErrorPopup";
import StepLayout from "../StepLayout";
import { compressImage } from "@/lib/utils/compressImage";

const formatDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
};

interface Props extends StepCommonProps {
  expanded?: boolean;
  onToggle?: () => void;
}

export default function GridTieStep({ lead, state, refresh, expanded, onToggle }: Props) {
  const [utility, setUtility] = useState(lead.grid_utility || "");
  const [appNo, setAppNo] = useState(lead.grid_app_no || "");
  const [ercDate, setErcDate] = useState(lead.grid_erc_submitted_date?.slice(0, 10) || "");
  const [submitDate, setSubmitDate] = useState(lead.grid_submitted_date?.slice(0, 10) || "");
  const [inspectDate, setInspectDate] = useState(lead.grid_inspection_date?.slice(0, 10) || "");
  const [approveDate, setApproveDate] = useState(lead.grid_approved_date?.slice(0, 10) || "");
  const [meterDate, setMeterDate] = useState(lead.grid_meter_changed_date?.slice(0, 10) || "");
  const [note, setNote] = useState(lead.grid_note || "");
  const [permitUrl, setPermitUrl] = useState<string | null>(lead.grid_permit_doc_url);
  const [uploading, setUploading] = useState(false);
  const [closing, setClosing] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);

  // Auto-save
  useEffect(() => {
    if (state !== "active") return;
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grid_utility: utility || null,
          grid_app_no: appNo || null,
          grid_erc_submitted_date: ercDate || null,
          grid_submitted_date: submitDate || null,
          grid_inspection_date: inspectDate || null,
          grid_approved_date: approveDate || null,
          grid_meter_changed_date: meterDate || null,
          grid_note: note || null,
        }),
      }).catch(console.error);
    }, 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utility, appNo, ercDate, submitDate, inspectDate, approveDate, meterDate, note]);

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
    if (!approveDate) missing.push("วันที่อนุมัติ");
    if (!meterDate) missing.push("วันเปลี่ยนมิเตอร์");
    if (!permitUrl) missing.push("ใบอนุญาต/PPA");
    if (missing.length > 0) { setNextError(missing.join(", ")); return; }

    setClosing(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "closed" }),
      });
      refresh();
    } finally { setClosing(false); }
  };

  const renderDoneContent = () => (
    <>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Info label="การไฟฟ้า" value={lead.grid_utility} />
        <Info label="เลขที่คำขอ" value={lead.grid_app_no} mono />
        <Info label="ยื่น ERC" value={formatDate(lead.grid_erc_submitted_date)} />
        <Info label="ยื่น กฟน./กฟภ." value={formatDate(lead.grid_submitted_date)} />
        <Info label="วันนัดตรวจ" value={formatDate(lead.grid_inspection_date)} />
        <Info label="วันอนุมัติ" value={formatDate(lead.grid_approved_date)} />
        <Info label="เปลี่ยนมิเตอร์" value={formatDate(lead.grid_meter_changed_date)} />
      </div>
      {lead.grid_permit_doc_url && (
        <a href={lead.grid_permit_doc_url} target="_blank" rel="noreferrer"
           className="flex items-center justify-center gap-2 w-full h-10 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-700">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          ดูใบอนุญาต
        </a>
      )}
      {lead.grid_note && (
        <div className="border-l-3 border-gray-300 pl-3 text-sm">
          <div className="text-xs font-bold text-gray-400 uppercase mb-1">หมายเหตุ</div>
          <div className="text-gray-800 whitespace-pre-wrap">{lead.grid_note}</div>
        </div>
      )}
    </>
  );

  return (
    <StepLayout
      state={state}
      expanded={expanded}
      onToggle={onToggle}
      doneHeader={<span className="text-sm font-semibold text-emerald-700">ขนานไฟสำเร็จ{lead.grid_meter_changed_date ? ` · ${formatDate(lead.grid_meter_changed_date)}` : ""}</span>}
      renderDone={renderDoneContent}
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

      {/* Date timeline */}
      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Timeline</div>
        <DateRow label="ลงทะเบียน ERC (กกพ.)" value={ercDate} onChange={setErcDate} />
        <DateRow label="ยื่นคำขอ กฟน./กฟภ." value={submitDate} onChange={setSubmitDate} />
        <DateRow label="นัดช่างเข้าตรวจ (COD)" value={inspectDate} onChange={setInspectDate} />
        <DateRow label="อนุมัติ / ผ่านตรวจ" value={approveDate} onChange={setApproveDate} highlight />
        <DateRow label="เปลี่ยนมิเตอร์ 2 ทาง" value={meterDate} onChange={setMeterDate} highlight />
      </div>

      {/* Permit / PPA upload */}
      <div>
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">ใบอนุญาต / PPA</label>
        {permitUrl ? (
          <div className="relative">
            {permitUrl.match(/\.(pdf)$/i) ? (
              <a href={permitUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
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

function DateRow({ label, value, onChange, highlight }: { label: string; value: string; onChange: (v: string) => void; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`text-xs flex-1 ${highlight ? "font-semibold text-gray-800" : "text-gray-500"}`}>{label}</span>
      <input type="date" value={value} onChange={e => onChange(e.target.value)}
        className={`w-[160px] h-9 px-2 rounded-lg border text-xs focus:outline-none focus:border-primary ${highlight ? "border-amber-300 bg-amber-50/50" : "border-gray-200 bg-white"}`} />
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-200 p-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{label}</div>
      <div className={`text-sm font-semibold text-gray-800 ${mono ? "font-mono" : ""}`}>{value || "—"}</div>
    </div>
  );
}
