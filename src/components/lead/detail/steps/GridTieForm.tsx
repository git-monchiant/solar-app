"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import Dropdown from "@/components/ui/Dropdown";
import { compressImage } from "@/lib/utils/compressImage";
import { useFileViewer } from "@/lib/hooks/useFileViewer";
import FallbackImage from "@/components/ui/FallbackImage";
import type { Lead } from "./types";
import {
  getGridTieChecklistItems,
  getGridTieFinalMissing,
  getGridTieProgress,
  parseGridTieChecklist,
  type GridTieApplicantType,
  type GridTieChecklistEntry,
  type GridTieChecklistItem,
  type GridTieChecklistState,
} from "@/lib/gridTie";

export interface GridTieFormHandle {
  flush: () => Promise<boolean>;
}

interface Props {
  lead: Lead;
  mode: "draft" | "final";
  refresh: () => Promise<unknown> | void;
  onProgressChange?: (progress: { received: number; total: number; complete: boolean }) => void;
  onClosed?: () => void;
}

const GridTieForm = forwardRef<GridTieFormHandle, Props>(function GridTieForm(
  { lead, mode, refresh, onProgressChange, onClosed }, ref,
) {
  const fileViewer = useFileViewer();
  const [utility, setUtility] = useState(lead.grid_utility || "");
  const [appNo, setAppNo] = useState(lead.grid_app_no || "");
  const [applicantType, setApplicantType] = useState<GridTieApplicantType | "">(
    lead.grid_applicant_type === "individual" || lead.grid_applicant_type === "juristic" ? lead.grid_applicant_type : "",
  );
  const [checklist, setChecklist] = useState<GridTieChecklistState>(() => parseGridTieChecklist(lead.grid_document_checklist));
  const [note, setNote] = useState(lead.grid_note || "");
  const [applicationDocUrl, setApplicationDocUrl] = useState<string | null>(lead.grid_application_doc_url);
  const [permitUrl, setPermitUrl] = useState<string | null>(lead.grid_permit_doc_url);
  const [uploadingApplicationDoc, setUploadingApplicationDoc] = useState(false);
  const [uploadingPermit, setUploadingPermit] = useState(false);
  const [closing, setClosing] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const checklistItems = useMemo(() => getGridTieChecklistItems(utility, applicantType), [utility, applicantType]);

  const payload = useMemo(() => ({
    grid_utility: utility || null,
    grid_app_no: appNo || null,
    grid_applicant_type: applicantType || null,
    grid_document_checklist: Object.keys(checklist).length > 0 ? JSON.stringify(checklist) : null,
    grid_note: note || null,
  }), [utility, appNo, applicantType, checklist, note]);
  const signature = JSON.stringify(payload);
  const savedSignature = useRef(JSON.stringify({
    grid_utility: lead.grid_utility || null,
    grid_app_no: lead.grid_app_no || null,
    grid_applicant_type: lead.grid_applicant_type || null,
    grid_document_checklist: lead.grid_document_checklist || null,
    grid_note: lead.grid_note || null,
  }));

  const save = useCallback(async (nextPayload = payload, nextSignature = signature) => {
    if (savedSignature.current === nextSignature) return true;
    setSaveState("saving");
    setError(null);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextPayload),
      });
      savedSignature.current = nextSignature;
      setSaveState("saved");
      return true;
    } catch (saveError) {
      setSaveState("error");
      setError(saveError instanceof Error ? saveError.message : "บันทึกข้อมูลขนานไฟไม่สำเร็จ");
      return false;
    }
  }, [lead.id, payload, signature]);

  useImperativeHandle(ref, () => ({ flush: () => save(payload, signature) }), [payload, save, signature]);

  useEffect(() => {
    if (savedSignature.current === signature) return;
    const timer = window.setTimeout(() => { void save(payload, signature); }, 800);
    return () => window.clearTimeout(timer);
  }, [payload, save, signature]);

  useEffect(() => {
    const progress = getGridTieProgress(utility, applicantType, payload.grid_document_checklist);
    onProgressChange?.(progress);
  }, [applicantType, onProgressChange, payload.grid_document_checklist, utility]);

  const updateChecklistItem = (id: string, patch: Partial<GridTieChecklistEntry>) => {
    setChecklist(current => {
      const entry = current[id] || { status: "missing", note: "" };
      return { ...current, [id]: { ...entry, ...patch } };
    });
  };

  const uploadDocument = async (file: File, kind: "application" | "permit") => {
    const setUploading = kind === "application" ? setUploadingApplicationDoc : setUploadingPermit;
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImage(file).catch(() => file);
      const formData = new FormData();
      formData.append("file", compressed);
      formData.append("filename", `gridtie_${kind}_${lead.id}`);
      const result = await apiFetch("/api/upload", { method: "POST", body: formData });
      const field = kind === "application" ? "grid_application_doc_url" : "grid_permit_doc_url";
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: result.url }),
      });
      if (kind === "application") setApplicationDocUrl(result.url);
      else setPermitUrl(result.url);
      setSaveState("saved");
    } catch (uploadError) {
      setSaveState("error");
      setError(uploadError instanceof Error ? uploadError.message : "อัปโหลดเอกสารไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  };

  const removeDocument = async (kind: "application" | "permit") => {
    const field = kind === "application" ? "grid_application_doc_url" : "grid_permit_doc_url";
    setError(null);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: null }),
      });
      if (kind === "application") setApplicationDocUrl(null);
      else setPermitUrl(null);
      setSaveState("saved");
    } catch (removeError) {
      setSaveState("error");
      setError(removeError instanceof Error ? removeError.message : "ลบเอกสารไม่สำเร็จ");
    }
  };

  const closeGridTie = async () => {
    if (!(await save(payload, signature))) return;
    const missing = getGridTieFinalMissing({
      ...payload,
      grid_application_doc_url: applicationDocUrl,
      grid_permit_doc_url: permitUrl,
    });
    if (missing.length > 0) {
      setError(`ข้อมูลยังไม่ครบ: ${missing.join(", ")}`);
      return;
    }
    setClosing(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "closed" }),
      });
      await refresh();
      onClosed?.();
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "ปิดงานขนานไฟไม่สำเร็จ");
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="space-y-3">
      {mode === "draft" && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5">
          <div className="text-sm font-bold text-violet-800">เอกสารขอขนานไฟกับการไฟฟ้าและลดหย่อนภาษี</div>
        </div>
      )}

      <div className="flex min-h-5 items-center justify-end text-xs">
        {saveState === "saving" && <span className="text-amber-600">กำลังบันทึก…</span>}
        {saveState === "saved" && <span className="text-emerald-600">✓ บันทึกแล้ว</span>}
        {saveState === "error" && <span className="text-red-600">บันทึกไม่สำเร็จ</span>}
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">การไฟฟ้า</label>
          <Dropdown heightClassName="h-11" value={utility} onChange={v => setUtility(v)} options={[
            { value: "MEA", label: "MEA (นครหลวง)" },
            { value: "PEA", label: "PEA (ส่วนภูมิภาค)" },
          ]} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">เลขที่ใบรับ</label>
          <input value={appNo} onChange={event => setAppNo(event.target.value)} placeholder="XXX-XXXX" className="h-11 w-full rounded-lg border border-gray-200 px-3 font-mono focus:border-primary focus:outline-none" />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">ประเภทผู้ยื่น</label>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1">
          {(["individual", "juristic"] as const).map(type => (
            <button key={type} type="button" onClick={() => setApplicantType(type)} className={`h-9 rounded-md text-sm font-semibold transition-colors ${applicantType === type ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
              {type === "individual" ? "บุคคลธรรมดา" : "นิติบุคคล"}
            </button>
          ))}
        </div>
      </div>

      {utility && applicantType ? (
        <ChecklistPanel items={checklistItems} value={checklist} utility={utility} onChange={updateChecklistItem} />
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center">
          <div className="text-sm font-semibold text-gray-600">เลือกการไฟฟ้าและประเภทผู้ยื่น</div>
          <div className="mt-1 text-xs text-gray-400">ระบบจะแสดง Checklist เอกสารที่ต้องใช้ให้ตรงกับงาน</div>
        </div>
      )}

      <DocumentUpload
        label="เอกสารยื่นขอขนานไฟ" url={applicationDocUrl} uploading={uploadingApplicationDoc}
        onUpload={file => uploadDocument(file, "application")} onRemove={() => removeDocument("application")}
        onOpen={fileViewer.handler(applicationDocUrl || "", "เอกสารยื่นขอขนานไฟ")}
      />
      <DocumentUpload
        label="ใบอนุญาต / PPA" url={permitUrl} uploading={uploadingPermit}
        onUpload={file => uploadDocument(file, "permit")} onRemove={() => removeDocument("permit")}
        onOpen={fileViewer.handler(permitUrl || "", "ใบอนุญาต / PPA")}
      />

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">หมายเหตุ</label>
        <textarea value={note} onChange={event => setNote(event.target.value)} rows={2} placeholder="เช่น โซน, เจ้าหน้าที่ติดต่อ..." className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 focus:border-primary focus:outline-none" />
      </div>

      {mode === "final" && (
        <button type="button" onClick={closeGridTie} disabled={closing || saveState === "saving"} className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 text-sm font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-50">
          {closing ? "กำลังปิดงาน..." : "ปิดงาน — ขนานไฟเสร็จสิ้น"}
        </button>
      )}
      {fileViewer.modal}
    </div>
  );
});

export default GridTieForm;

function DocumentUpload({ label, url, uploading, onUpload, onRemove, onOpen }: {
  label: string; url: string | null; uploading: boolean; onUpload: (file: File) => void; onRemove: () => void; onOpen: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</label>
      {url ? (
        <div className="relative">
          {url.match(/\.pdf(?:$|\?)/i) ? (
            <a href={url} onClick={onOpen} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 hover:bg-gray-50">
              <span className="text-xl text-red-500">▣</span><span className="flex-1 text-sm text-gray-700">{label}.pdf</span>
            </a>
          ) : <FallbackImage src={url} alt={label} className="max-h-40 max-w-full rounded-lg border border-gray-200 bg-gray-50 object-contain" />}
          <button type="button" onClick={onRemove} aria-label={`ลบ${label}`} className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white" style={{ minHeight: 0 }}>✕</button>
        </div>
      ) : (
        <label className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-3 transition-colors ${uploading ? "cursor-wait opacity-60" : "cursor-pointer hover:border-primary"}`}>
          <span className="text-xl text-gray-400">＋</span><span className="text-sm text-gray-500">{uploading ? "กำลังอัปโหลด..." : `อัปโหลด${label}`}</span>
          <input type="file" accept="image/*,.pdf" disabled={uploading} className="hidden" onChange={event => event.target.files?.[0] && onUpload(event.target.files[0])} />
        </label>
      )}
    </div>
  );
}

function ChecklistPanel({ items, value, utility, onChange }: {
  items: GridTieChecklistItem[]; value: GridTieChecklistState; utility: string; onChange: (id: string, patch: Partial<GridTieChecklistEntry>) => void;
}) {
  const requiredItems = items.filter(item => !item.conditional || value[item.id]?.required);
  const receivedCount = requiredItems.filter(item => value[item.id]?.status === "received").length;
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2.5">
        <div><div className="text-xs font-bold uppercase tracking-wider text-gray-500">Checklist เอกสารลูกค้า</div><div className="mt-0.5 text-xxs text-gray-400">{utility} · ตรวจรับก่อนจัดชุดยื่นขอขนานไฟ</div></div>
        <div className={`rounded-full px-2.5 py-1 text-xs font-bold ${receivedCount === requiredItems.length ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>{receivedCount}/{requiredItems.length} ได้รับแล้ว</div>
      </div>
      <div className="divide-y divide-gray-100">
        {items.map((item, index) => {
          const entry = value[item.id] || { status: "missing" as const, note: "" };
          const isRequired = !item.conditional || entry.required === true;
          return (
            <div key={item.id} className={`grid grid-cols-1 gap-2 px-3 py-2.5 md:grid-cols-[minmax(280px,1fr)_minmax(230px,300px)_minmax(180px,0.75fr)] md:items-center ${isRequired ? "bg-white" : "bg-gray-50/70"}`}>
              <div className="min-w-0"><div className="flex items-start gap-2"><span className="mt-0.5 text-xs font-bold text-gray-400">{index + 1}.</span><div><div className="text-sm font-semibold text-gray-800">{item.label}</div><div className="mt-0.5 text-xs text-gray-500">{item.detail}</div></div></div>
                {item.conditional && <label className="mt-1 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-600"><input type="checkbox" checked={isRequired} onChange={event => onChange(item.id, { required: event.target.checked })} className="h-4 w-4" />จำเป็นสำหรับงานนี้</label>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={!isRequired} onClick={() => onChange(item.id, { status: "received" })} className={`h-9 rounded-lg border text-sm font-semibold disabled:opacity-40 ${entry.status === "received" && isRequired ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-200 bg-white text-gray-600"}`}>ได้รับแล้ว</button>
                <button type="button" disabled={!isRequired} onClick={() => onChange(item.id, { status: "missing" })} className={`h-9 rounded-lg border text-sm font-semibold disabled:opacity-40 ${entry.status !== "received" && isRequired ? "border-red-500 bg-red-500 text-white" : "border-gray-200 bg-white text-gray-600"}`}>ยังไม่ได้รับ</button>
              </div>
              <input value={entry.note} disabled={!isRequired} onChange={event => onChange(item.id, { note: event.target.value })} placeholder="หมายเหตุ" className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm disabled:bg-gray-100" />
            </div>
          );
        })}
      </div>
    </section>
  );
}
