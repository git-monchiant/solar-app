"use client";
import { DocumentIcon } from "@/components/ui/icons";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useMe } from "@/lib/roles";
import type { StepCommonProps, Package } from "./types";
import ErrorPopup from "@/components/ui/ErrorPopup";
import FallbackImage from "@/components/ui/FallbackImage";
import StepLayout from "../StepLayout";
import { compressImage } from "@/lib/utils/compressImage";
import { formatTHB, formatThaiDate as formatDate } from "@/lib/utils/formatters";
import { parseQuotationFiles, serializeQuotationFiles, type QuoteOption } from "@/lib/utils/quotation";
import { useFileViewer } from "@/lib/hooks/useFileViewer";
import DoneSection from "./DoneSection";
import QuotationBuilder from "./QuotationBuilder";

const MAX_QUOTES = 3;
// Per-slot draft = saved URL (if any) + a freshly picked File (if any) +
// editable doc_no / amount. On send: file overrides existingUrl, slots with
// no file *and* no existingUrl are dropped.
type Slot = { existingUrl: string; file: File | null; docNo: string; amount: number };

interface Props extends StepCommonProps {
  packages: Package[];
  expanded?: boolean;
  onToggle?: () => void;
}

export default function QuoteStep({ lead, state, refresh, packages, expanded, onToggle }: Props) {
  const fileViewer = useFileViewer();
  // Default doc-no per slot: pulled from the shared mint endpoint so the
  // prefix + counter match the config in /settings (default "QT-YYNNNN").
  // Slot 0 = base, slots 1/2 append "-2"/"-3". Lead.quotation_doc_no (if
  // already stored) wins so reopening the step shows the same number.
  const [baseDocNo, setBaseDocNo] = useState<string>(lead.quotation_doc_no || "");
  useEffect(() => {
    if (baseDocNo) return;
    apiFetch(`/api/leads/${lead.id}/doc-no/mint?type=quotation`, { method: "POST" })
      .then((r: { docNo: string }) => setBaseDocNo(r.docNo))
      .catch(console.error);
    // baseDocNo is the gate — once we have one (from prop or fetch) the effect is done.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);
  // Strip any trailing `-N` from the inherited doc-no. lead.quotation_doc_no
  // can be a previously-accepted VARIANT (e.g., "QT-260705-2") — using that
  // as the base would mint slot 1/2 defaults as "QT-260705-2-2"/"-2-3",
  // a double-suffix format that validateDocNo rejects on the next save.
  const baseClean = baseDocNo.replace(/-\d+$/, "");
  const defaultDocNoFor = (i: number) => i === 0 ? baseClean : `${baseClean}-${i + 1}`;

  // Initialise 3 slots from quotation_files (JSON or legacy CSV). Empty
  // tail slots stay editable so the user can add up to 3.
  const initSlots = (): Slot[] => {
    const existing = parseQuotationFiles(lead.quotation_files, lead.quotation_doc_no || "", lead.quotation_amount || 0);
    const out: Slot[] = [];
    for (let i = 0; i < MAX_QUOTES; i++) {
      const e = existing[i];
      out.push({
        existingUrl: e?.url || "",
        file: null,
        docNo: e?.doc_no || defaultDocNoFor(i),
        amount: e?.amount || 0,
      });
    }
    return out;
  };

  const [slots, setSlots] = useState<Slot[]>(initSlots);
  // After the async mint resolves: (a) retro-fill any empty slot with the
  // default, and (b) NORMALIZE slot doc-nos that still carry legacy
  // multi-segment formats like "SM-QT-26-0040". The legacy values would
  // propagate to lead.quotation_doc_no via picked.docNo on send and get
  // rejected by validateDocNo (400). A canonical "PREFIX-counter" doc-no is
  // detected as `^[A-Z]+-\d…`; anything else gets rewritten to the expected
  // base/base-N. User-typed canonical values are preserved.
  useEffect(() => {
    if (!baseDocNo) return;
    setSlots(prev => prev.map((s, i) => {
      const expected = i === 0 ? baseDocNo : `${baseDocNo}-${i + 1}`;
      const isEmpty = !s.existingUrl && !s.file && !s.docNo;
      const isCanonical = !!s.docNo && /^[A-Z]+-\d+(-\d+)?$/.test(s.docNo);
      if (isEmpty || !isCanonical) return { ...s, docNo: expected };
      return s;
    }));
  }, [baseDocNo]);
  const [note, setNote] = useState(lead.quotation_note || "");
  const [byName, setByName] = useState(lead.quotation_by || "");
  const { me } = useMe();
  useEffect(() => {
    if (!byName && me?.full_name && !lead.quotation_by) setByName(me.full_name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  // Auto-save note + byName so a refresh before clicking "ส่ง" doesn't lose
  // what the user typed. Slot data is heavier (file blobs) — kept in memory
  // until send.
  useEffect(() => {
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotation_note: note || null,
          quotation_by: byName || null,
        }),
      }).catch(console.error);
    }, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, byName]);

  const updateSlot = (i: number, patch: Partial<Slot>) => {
    setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);

  // Upload the picked file immediately so a refresh before "ส่ง" doesn't
  // lose it. Optimistically sets `file` for instant UI feedback, then swaps
  // in the persisted URL once /api/upload returns.
  const uploadSlotFile = async (i: number, file: File) => {
    updateSlot(i, { file });
    setUploading(true);
    try {
      const compressed = await compressImage(file).catch(() => file);
      const formData = new FormData();
      formData.append("file", compressed);
      formData.append("lead_id", String(lead.id));
      formData.append("type", "quotation");
      formData.append("filename", i === 0 ? baseDocNo : `${baseDocNo}-${i + 1}`);
      const res = await apiFetch("/api/upload", { method: "POST", body: formData });
      if (res?.url) updateSlot(i, { existingUrl: res.url, file: null });
    } catch (e) {
      console.error("quotation upload failed:", e);
    } finally {
      setUploading(false);
    }
  };

  // Auto-save quotation_files whenever slots stabilise — so amount edits,
  // file deletions, and finished uploads all persist without waiting for "ส่ง".
  // Skipped while a fresh upload is still in flight (would persist an empty
  // slot mid-upload). Saving as JSON via serializeQuotationFiles().
  useEffect(() => {
    if (uploading) return;
    const t = setTimeout(() => {
      const out: QuoteOption[] = [];
      for (const s of slots) {
        if (!s.existingUrl) continue;
        out.push({ url: s.existingUrl, doc_no: s.docNo || "", amount: Number(s.amount) || 0 });
      }
      const filesJson = serializeQuotationFiles(out);
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotation_files: filesJson }),
      }).catch(console.error);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, uploading]);

  const uploadAndBuildJson = async (): Promise<string | null> => {
    setUploading(true);
    try {
      const out: QuoteOption[] = [];
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        // Skip slot with no file and no saved URL.
        if (!s.file && !s.existingUrl) continue;
        let url = s.existingUrl;
        if (s.file) {
          const compressed = await compressImage(s.file).catch(() => s.file!);
          const formData = new FormData();
          formData.append("file", compressed);
          formData.append("lead_id", String(lead.id));
          formData.append("type", "quotation");
          formData.append("filename", i === 0 ? baseDocNo : `${baseDocNo}-${i + 1}`);
          const res = await apiFetch("/api/upload", { method: "POST", body: formData });
          url = res.url || "";
        }
        if (!url) continue;
        out.push({ url, doc_no: s.docNo || "", amount: Number(s.amount) || 0 });
      }
      return serializeQuotationFiles(out);
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    const filledSlots = slots.filter(s => (s.file || s.existingUrl) && s.amount > 0);
    const missing: string[] = [];
    if (filledSlots.length === 0) missing.push("ใบเสนอราคา (ไฟล์ + ยอด อย่างน้อย 1 ชุด)");
    if (!note) missing.push("บันทึกถึงทีมขาย");
    if (missing.length > 0) {
      setNextError(missing.join(", "));
      return;
    }
    setSaving(true);
    try {
      const filesJson = await uploadAndBuildJson();
      // 1 quotation → auto-pick it so OrderStep doesn't need to ask.
      // Multiple → leave idx + lead-level amount/doc_no null; OrderStep
      // substep 1 will force the user to pick.
      const single = filledSlots.length === 1;
      const pickedIdx = single ? slots.findIndex(s => (s.file || s.existingUrl) && s.amount > 0) : null;
      const picked = pickedIdx !== null && pickedIdx >= 0 ? slots[pickedIdx] : null;
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "order",
          quotation_note: note || null,
          quotation_files: filesJson,
          quotation_accepted_idx: pickedIdx !== null && pickedIdx >= 0 ? pickedIdx : null,
          quotation_amount: picked ? picked.amount : null,
          quotation_doc_no: picked ? picked.docNo : null,
          quotation_by: byName || null,
          quote_sent_by: me?.id ?? null,
        }),
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const renderDoneContent = () => {
    const options = parseQuotationFiles(lead.quotation_files, lead.quotation_doc_no || "", lead.quotation_amount || 0);
    const acceptedIdx = lead.quotation_accepted_idx;
    return (
      <>
        {typeof lead.quotation_amount === "number" && acceptedIdx !== null && (
          <DoneSection color="blue" title={options.length > 1 ? "มูลค่าที่ลูกค้าเลือก" : "มูลค่าตามใบเสนอราคา"}>
            <div className="text-lg font-bold font-mono tabular-nums text-gray-900">{formatTHB(lead.quotation_amount)} บาท</div>
          </DoneSection>
        )}

        {(lead.quotation_sent_date || lead.quotation_by) && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {lead.quotation_sent_date && (
              <div>
                <div className="text-xxs font-bold text-gray-400 uppercase tracking-wider">วันที่ส่ง</div>
                <div className="text-sm font-medium text-gray-800">{formatDate(lead.quotation_sent_date)}</div>
              </div>
            )}
            {lead.quotation_by && (
              <div>
                <div className="text-xxs font-bold text-gray-400 uppercase tracking-wider">ผู้จัดทำ</div>
                <div className="text-sm font-medium text-gray-800">{lead.quotation_by}</div>
              </div>
            )}
          </div>
        )}

        {lead.quotation_note && (
          <DoneSection color="gray" title="บันทึก">
            <div className="text-gray-800 whitespace-pre-wrap">{lead.quotation_note}</div>
          </DoneSection>
        )}

        {options.length > 0 && (
          <DoneSection color="orange" title={`ใบเสนอราคา${options.length > 1 ? ` (${options.length} ชุด)` : ""}`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {options.map((opt, i) => {
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(opt.url);
                const fileName = opt.url.split("/").pop() || `ไฟล์ ${i + 1}`;
                const isAccepted = acceptedIdx === i;
                return (
                  <div key={i} className={`rounded-lg border p-2 ${isAccepted ? "border-emerald-400 bg-emerald-50/60" : "border-gray-200 bg-white"}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-xxs font-bold uppercase tracking-wider text-gray-500">ชุด {i + 1}</div>
                      {isAccepted && <div className="text-xxs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">เลือกแล้ว</div>}
                    </div>
                    {isImage ? (
                      <a href={opt.url} onClick={fileViewer.handler(opt.url, `ใบเสนอราคา ชุด ${i + 1}`)} className="block">
                        <FallbackImage src={opt.url} alt={fileName} className="max-h-32 max-w-full object-contain bg-gray-50 rounded border border-gray-200 hover:opacity-80 transition" fallbackLabel="ไฟล์หาย" />
                      </a>
                    ) : (
                      <a href={opt.url} onClick={fileViewer.handler(opt.url, `ใบเสนอราคา ชุด ${i + 1}`)} className="flex items-center gap-2 px-2 py-1.5 rounded bg-gray-50 border border-gray-200 hover:bg-gray-100 transition-colors">
                        <DocumentIcon className="w-4 h-4 text-gray-400 shrink-0" strokeWidth={2} />
                        <span className="text-xs text-primary font-semibold truncate">{fileName}</span>
                      </a>
                    )}
                    <div className="mt-1.5 text-sm font-bold font-mono tabular-nums text-gray-900">{formatTHB(opt.amount)} บาท</div>
                    {opt.doc_no && <div className="text-xxs text-gray-500 font-mono mt-0.5">{opt.doc_no}</div>}
                  </div>
                );
              })}
            </div>
          </DoneSection>
        )}
      </>
    );
  };

  return (
    <StepLayout
      state={state}
      expanded={expanded}
      onToggle={onToggle}
      doneHeader={(() => {
        // Compact ใบเสนอราคา button in the done header — mirrors the
        // pattern PreSurvey uses (ใบยืนยันการจอง / ใบเสร็จ). Opens the
        // accepted set when the customer has picked; otherwise the first
        // available. Hidden when no files exist yet.
        const options = parseQuotationFiles(lead.quotation_files, lead.quotation_doc_no || "", lead.quotation_amount || 0);
        const acceptedIdx = lead.quotation_accepted_idx;
        const pick = (acceptedIdx != null && options[acceptedIdx]) ? options[acceptedIdx] : options[0];
        return (
          <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center gap-1.5 md:gap-2">
            <span className="text-sm font-semibold text-emerald-700 md:flex-1 md:truncate">
              ส่งใบเสนอราคาแล้ว{typeof lead.quotation_amount === "number" ? ` · ${formatTHB(lead.quotation_amount)} บาท` : ""}
            </span>
            {pick && (
              <a
                href={pick.url}
                onClick={fileViewer.handler(pick.url, `ใบเสนอราคา${acceptedIdx != null ? " (ที่ลูกค้าเลือก)" : ""}`)}
                className="md:mr-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-primary/30 bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors shrink-0"
              >
                <DocumentIcon className="w-4 h-4" strokeWidth={2} />
                ใบเสนอราคา{options.length > 1 ? ` ${options.length}` : ""}
              </a>
            )}
          </div>
        );
      })()}
      renderDone={renderDoneContent}
      overlay={fileViewer.modal}
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

      <QuotationBuilder lead={lead} packages={packages} refresh={refresh} />

      <button type="button" onClick={() => setShowLegacy(v => !v)} className="text-xs text-gray-400 underline underline-offset-2 hover:text-primary">
        {showLegacy ? "ซ่อนการนำเข้าไฟล์แบบเดิม" : "หรืออัปโหลดใบเสนอราคาจากภายนอก (Legacy)"}
      </button>

      {showLegacy && <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 space-y-3">

      {/* Quotation slots — up to 3 columns. Slot 1 is required; 2/3 optional. */}
      <div>
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">ใบเสนอราคา <span className="text-gray-400 normal-case">(สูงสุด 3 ชุด — ลูกค้าจะเลือก 1 ใน Order step)</span> <span className="text-red-500">*</span></label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {slots.map((s, i) => {
            const hasFileOrUrl = !!s.file || !!s.existingUrl;
            const filename = s.file?.name || (s.existingUrl ? s.existingUrl.split("/").pop() || "ไฟล์ที่แนบไว้" : "");
            return (
              <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                <div className="text-xxs font-bold uppercase tracking-wider text-gray-500">ชุด {i + 1}{i === 0 ? " *" : ""}</div>
                {/* File picker */}
                {!hasFileOrUrl ? (
                  <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-gray-200 bg-white hover:border-primary hover:bg-primary/5 cursor-pointer transition-colors">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" /></svg>
                    <span className="text-xs text-gray-500">เลือกไฟล์</span>
                    <input type="file" accept="image/*,.pdf" className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) uploadSlotFile(i, f);
                      }} />
                  </label>
                ) : (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-gray-200 bg-white">
                    <div className="flex items-center gap-2 min-w-0">
                      <DocumentIcon className="w-4 h-4 text-primary shrink-0" strokeWidth={2} />
                      <span className="truncate text-xs text-gray-700">{filename}</span>
                    </div>
                    <button type="button" onClick={() => updateSlot(i, { file: null, existingUrl: "" })} className="text-red-400 hover:text-red-600 shrink-0 text-base leading-none" style={{ minHeight: 0 }}>✕</button>
                  </div>
                )}
                {/* Amount */}
                <div className="relative">
                  <input type="text" inputMode="decimal" value={s.amount || ""}
                    onChange={e => updateSlot(i, { amount: parseFloat(e.target.value.replace(/[^\d.]/g, "")) || 0 })}
                    placeholder="ยอด (บาท)"
                    className="w-full h-11 pl-3 pr-12 rounded-md border border-gray-200 text-base font-bold font-mono focus:outline-none focus:border-primary bg-white" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xxs font-semibold text-gray-400 pointer-events-none">บาท</span>
                </div>
                {/* Doc no */}
                <input type="text" value={s.docNo} onChange={e => updateSlot(i, { docNo: e.target.value })}
                  placeholder="เลขที่ใบเสนอราคา"
                  className="w-full h-8 px-3 rounded-md border border-gray-200 text-xs font-mono focus:outline-none focus:border-primary bg-white" />
              </div>
            );
          })}
        </div>
      </div>

      {/* ผู้จัดทำของไฟล์ภายนอก */}
      <div>
        <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">ผู้จัดทำ</label>
        <input type="text" value={byName} onChange={e => setByName(e.target.value)}
          className="w-full h-11 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
      </div>

      {/* Send button */}
      <button
        onClick={send}
        disabled={saving || uploading}
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

      </div>}

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
      </div>
    </StepLayout>
  );
}
