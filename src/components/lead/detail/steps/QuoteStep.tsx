"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/roles";
import type { StepCommonProps, Package } from "./types";
import ErrorPopup from "@/components/ui/ErrorPopup";
import FallbackImage from "@/components/ui/FallbackImage";
import StepLayout from "../StepLayout";
import { compressImage } from "@/lib/utils/compressImage";
import { formatTHB, formatThaiDate as formatDate } from "@/lib/utils/formatters";

interface Props extends StepCommonProps {
  packages: Package[];
  expanded?: boolean;
  onToggle?: () => void;
}

export default function QuoteStep({ lead, state, refresh, expanded, onToggle }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState(lead.quotation_note || "");
  const [amount, setAmount] = useState<number>(lead.quotation_amount || 0);
  // Default to "QT-<yy><leadId:4d>" — same shape as the uploaded filename so
  // staff don't have to retype it. Persisted on save like a normal value.
  const defaultDocNo = `QT-${new Date().getFullYear().toString().slice(-2)}${String(lead.id).padStart(4, "0")}`;
  const [docNo, setDocNo] = useState(lead.quotation_doc_no || defaultDocNo);
  // sentDate is captured automatically on submit (current timestamp) — no UI input.
  const [byName, setByName] = useState(lead.quotation_by || "");
  const { me } = useMe();
  useEffect(() => {
    if (!byName && me?.full_name && !lead.quotation_by) setByName(me.full_name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  // Auto-save the four free-form fields so a refresh before clicking "ส่ง" doesn't
  // lose what the user has typed. Mirrors the pattern in SurveyStep. The submit
  // handler still PATCHes the same fields so this is purely additive.
  useEffect(() => {
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotation_note: note || null,
          quotation_amount: amount || null,
          quotation_doc_no: docNo || null,
          quotation_by: byName || null,
        }),
      }).catch(console.error);
    }, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, amount, docNo, byName]);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);

  const uploadFiles = async (): Promise<string> => {
    if (files.length === 0) return lead.quotation_files || "";
    setUploading(true);
    try {
      const year = new Date().getFullYear().toString().slice(-2);
      const qtNumber = `QT-${year}${String(lead.id).padStart(4, "0")}`;
      const compressed = await compressImage(files[0]).catch(() => files[0]);
      const formData = new FormData();
      formData.append("file", compressed);
      formData.append("lead_id", String(lead.id));
      formData.append("type", "quotation");
      formData.append("filename", qtNumber);
      const res = await apiFetch("/api/upload", { method: "POST", body: formData });
      return res.url || "";
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    const missing: string[] = [];
    if (!amount || amount <= 0) missing.push("ยอดใบเสนอราคา");
    if (files.length === 0 && !lead.quotation_files) missing.push("ไฟล์ใบเสนอราคา");
    if (!note) missing.push("บันทึกถึงทีมขาย");
    if (missing.length > 0) {
      setNextError(missing.join(", "));
      return;
    }
    setSaving(true);
    try {
      const url = await uploadFiles();
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "order",
          quotation_note: note || null,
          quotation_files: url || null,
          quotation_amount: amount || null,
          quotation_doc_no: docNo || null,
          quotation_sent_date: new Date().toISOString().slice(0, 10),
          quotation_by: byName || null,
          quote_sent_by: me?.id ?? null,
        }),
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const renderDoneContent = () => (
    <>
      {typeof lead.quotation_amount === "number" && (
        <div className="border-l-3 border-blue-400 pl-3">
          <div className="text-xs font-bold text-blue-600 uppercase mb-1">มูลค่าตามใบเสนอราคา</div>
          <div className="text-lg font-bold font-mono tabular-nums text-gray-900">{formatTHB(lead.quotation_amount)} บาท</div>
        </div>
      )}

      {(lead.quotation_doc_no || lead.quotation_sent_date || lead.quotation_by) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          {lead.quotation_doc_no && (
            <div>
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">เลขที่ใบเสนอราคา</div>
              <div className="text-sm font-medium text-gray-800 font-mono">{lead.quotation_doc_no}</div>
            </div>
          )}
          {lead.quotation_sent_date && (
            <div>
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">วันที่ส่ง</div>
              <div className="text-sm font-medium text-gray-800">{formatDate(lead.quotation_sent_date)}</div>
            </div>
          )}
          {lead.quotation_by && (
            <div className="col-span-2">
              <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">ผู้จัดทำ</div>
              <div className="text-sm font-medium text-gray-800">{lead.quotation_by}</div>
            </div>
          )}
        </div>
      )}

      {lead.quotation_note && (
        <div className="border-l-3 border-gray-300 pl-3">
          <div className="text-xs font-bold text-gray-400 uppercase mb-1">บันทึก</div>
          <div className="text-gray-800 whitespace-pre-wrap">{lead.quotation_note}</div>
        </div>
      )}

      {lead.quotation_files && (() => {
        const url = lead.quotation_files;
        const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
        const fileName = url.split("/").pop() || "ไฟล์ใบเสนอราคา";
        return (
          <div className="border-l-3 border-orange-400 pl-3">
            <div className="text-xs font-bold text-orange-600 uppercase mb-1.5">ไฟล์ใบเสนอราคา</div>
            {isImage ? (
              <a href={url} target="_blank" rel="noreferrer">
                <FallbackImage src={url} alt={fileName} className="max-h-40 max-w-full object-contain bg-gray-50 rounded-lg border border-gray-200 hover:opacity-80 transition" fallbackLabel="ไฟล์หาย" />
              </a>
            ) : (
              <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                <span className="text-sm text-primary font-semibold truncate">{fileName}</span>
              </a>
            )}
          </div>
        );
      })()}
    </>
  );

  return (
    <StepLayout
      state={state}
      expanded={expanded}
      onToggle={onToggle}
      doneHeader={<span className="text-sm font-semibold text-emerald-700">ส่งใบเสนอราคาแล้ว{typeof lead.quotation_amount === "number" ? ` · ${formatTHB(lead.quotation_amount)} บาท` : ""}</span>}
      renderDone={renderDoneContent}
    >
      <div className="space-y-3">
      {/* Note */}
      <div>
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">บันทึกถึงทีมขาย <span className="text-red-500">*</span></label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="รายละเอียดใบเสนอราคา, หมายเหตุ..."
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none"
        />
      </div>

      {/* File upload */}
      <div>
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">แนบไฟล์ <span className="text-red-500">*</span></label>
        <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-gray-200 bg-gray-50 hover:border-primary hover:bg-primary/5 cursor-pointer transition-colors">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" /></svg>
          <span className="text-sm text-gray-500">เลือกไฟล์ (รูป, PDF, เอกสาร)</span>
          <input
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={e => {
              if (e.target.files?.[0]) setFiles([e.target.files[0]]);
            }}
          />
        </label>

        {/* File list */}
        {files.length > 0 && (
          <div className="mt-2 space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm text-gray-700 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                <div className="flex items-center gap-2 min-w-0">
                  <svg className="w-4 h-4 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                  <span className="truncate">{f.name}</span>
                </div>
                <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 shrink-0" style={{ minHeight: 0 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Amount */}
      <div>
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">มูลค่าตามใบเสนอราคา <span className="text-red-500">*</span></label>
        <div className="relative">
          <input type="text" inputMode="decimal" value={amount || ""}
            onChange={e => setAmount(parseFloat(e.target.value.replace(/[^\d.]/g, "")) || 0)}
            placeholder="0"
            className="w-full h-14 pl-3 pr-16 rounded-lg border border-gray-200 text-2xl font-bold font-mono focus:outline-none focus:border-primary" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-base font-semibold text-gray-400 pointer-events-none">บาท</span>
        </div>
      </div>

      {/* Doc no / sent date / by */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">เลขที่ใบเสนอราคา</label>
          <input type="text" value={docNo} onChange={e => setDocNo(e.target.value)}
            className="w-full h-11 px-3 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">ผู้จัดทำ</label>
          <input type="text" value={byName} onChange={e => setByName(e.target.value)}
            className="w-full h-11 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
        </div>
      </div>

      {/* Send button */}
      <button
        onClick={send}
        disabled={saving || uploading || !amount}
        className="w-full h-11 mt-1 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
      >
        {saving || uploading ? (
          <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> กำลังส่ง...</>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
            ส่งใบเสนอราคาให้ทีมขาย
          </>
        )}
      </button>

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
      </div>
    </StepLayout>
  );
}
