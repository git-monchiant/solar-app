"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { compressImage } from "@/lib/utils/compressImage";
import { useFileViewer } from "@/lib/hooks/useFileViewer";
import FallbackImage from "@/components/ui/FallbackImage";
import type { Lead } from "./types";
import {
  GRID_TIE_MILESTONES,
  getGridTieOutOfOrderMilestones,
  getGridTieChecklistItems,
  getGridTieFinalMissing,
  getGridTieProgress,
  parseGridTieChecklist,
  type GridTieApplicantType,
  type GridTieChecklistEntry,
  type GridTieChecklistItem,
  type GridTieChecklistState,
  type GridTieMilestoneKey,
} from "@/lib/gridTie";

/** สเปคอุปกรณ์ที่ทีมติดตั้งกรอกไว้ในใบตรวจติดตั้ง — ใช้เติมแถวอุปกรณ์ให้อัตโนมัติ */
interface SystemSpecs {
  panel?: { brand?: string; model?: string; count?: number | null; watt?: number | null };
  inverter?: { brand?: string; model?: string; kw?: number | null; sn?: string };
  battery?: { brand?: string; model?: string; kwh?: number | null };
}

export interface GridTieFormHandle {
  flush: () => Promise<boolean>;
}

interface Props {
  lead: Lead;
  mode: "draft" | "final";
  refresh: () => Promise<unknown> | void;
  onProgressChange?: (progress: { received: number; permit: number; total: number; complete: boolean }) => void;
  onClosed?: () => void;
}

/**
 * ค่าที่ระบบรู้อยู่แล้วจากขั้นตอนก่อนหน้า — เติมให้เป็นค่าตั้งต้นของช่องในแถว
 * ผู้ใช้แก้ทับได้ และเมื่อแก้แล้วค่าจะถูกเก็บลง checklist ไม่ย้อนกลับไปทับของเดิม
 */
function autofillFor(
  item: GridTieChecklistItem,
  lead: Lead,
  specs: SystemSpecs | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: string, value: unknown) => {
    if (value !== null && value !== undefined && String(value).trim() !== "") out[key] = String(value);
  };

  if (item.id === "latest_electricity_bill") {
    // ขนาดเครื่องวัด — Pre-Survey ก่อน ถ้าไม่มีค่อยใช้ผลสำรวจหน้างาน
    put("meter_size", lead.meter_size || lead.survey_meter_size);

    const phase = lead.pre_electrical_phase || lead.survey_electrical_phase;
    if (phase === "1_phase") out.phase = "1";
    else if (phase === "3_phase") out.phase = "3";

    // แรงดัน — 1 เฟสอ่านค่าเฟส-นิวทรัล, 3 เฟสอ่านค่าเฟส-เฟส
    put("voltage", out.phase === "3"
      ? lead.survey_voltage_ll ?? lead.survey_voltage_ln
      : lead.survey_voltage_ln ?? lead.survey_voltage_ll);

    // จำนวนสายอนุมานจากเฟส — เป็นค่าตั้งต้น แก้ทับได้
    if (out.phase === "1") out.wire = "2";
    else if (out.phase === "3") out.wire = "4";

    // เลขผู้ใช้ไฟ / เลขรหัสเครื่องวัด / ประเภทผู้ใช้ไฟ ยังไม่มีที่เก็บในระบบ ต้องกรอกมือ
    return out;
  }

  if (item.id === "site_coordinates") {
    put("lat", lead.survey_lat);
    put("lng", lead.survey_lng);
    if (lead.survey_lat != null && lead.survey_lng != null) {
      out.map_url = `https://www.google.com/maps?q=${lead.survey_lat},${lead.survey_lng}`;
    }
    return out;
  }

  // แถวอุปกรณ์ — ยกค่าจากใบตรวจติดตั้งที่ทีมกรอกไว้แล้ว
  if (item.id === "panel" && specs?.panel) {
    put("brand", specs.panel.brand);
    put("model", specs.panel.model);
    put("watt", specs.panel.watt);
    put("count", specs.panel.count);
    return out;
  }
  if (item.id === "inverter" && specs?.inverter) {
    put("brand", specs.inverter.brand);
    put("model", specs.inverter.model);
    put("kw", specs.inverter.kw);
    put("sn", specs.inverter.sn);
    return out;
  }
  if (item.id === "battery" && specs?.battery) {
    put("brand", specs.battery.brand);
    put("model", specs.battery.model);
    put("capacity_kwh", specs.battery.kwh);
    return out;
  }

  // Zero Export กับ CT ไม่มีที่เก็บที่ไหนในระบบเลย ต้องกรอกมือทั้งหมด
  return out;
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
  const [milestones, setMilestones] = useState<Record<string, string>>(() =>
    Object.fromEntries(GRID_TIE_MILESTONES.map(m => [m.key, lead[m.key] ? String(lead[m.key]).slice(0, 10) : ""])),
  );
  const [note, setNote] = useState(lead.grid_note || "");
  const [applicationDocUrl, setApplicationDocUrl] = useState<string | null>(lead.grid_application_doc_url);
  const [permitUrl, setPermitUrl] = useState<string | null>(lead.grid_permit_doc_url);
  const [uploadingApplicationDoc, setUploadingApplicationDoc] = useState(false);
  const [uploadingPermit, setUploadingPermit] = useState(false);
  const [systemSpecs, setSystemSpecs] = useState<SystemSpecs | null>(null);
  const [closing, setClosing] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const checklistItems = useMemo(() => getGridTieChecklistItems(applicantType), [applicantType]);

  // สเปคอุปกรณ์อยู่คนละตารางกับ lead — ดึงมาเติมแถวอุปกรณ์ให้เอง เงียบ ๆ ถ้าไม่มีใบตรวจ
  useEffect(() => {
    let alive = true;
    apiFetch(`/api/install-checklist/${lead.id}`)
      .then((row: { system_specs?: string | null }) => {
        if (!alive || !row?.system_specs) return;
        try { setSystemSpecs(JSON.parse(row.system_specs)); } catch { /* ข้อมูลเสีย ปล่อยว่าง */ }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [lead.id]);

  const payload = useMemo(() => ({
    grid_utility: utility || null,
    grid_app_no: appNo || null,
    grid_applicant_type: applicantType || null,
    grid_document_checklist: Object.keys(checklist).length > 0 ? JSON.stringify(checklist) : null,
    ...Object.fromEntries(GRID_TIE_MILESTONES.map(m => [m.key, milestones[m.key] || null])),
    grid_note: note || null,
  }), [utility, appNo, applicantType, checklist, milestones, note]);
  const signature = JSON.stringify(payload);
  const savedSignature = useRef(JSON.stringify({
    grid_utility: lead.grid_utility || null,
    grid_app_no: lead.grid_app_no || null,
    grid_applicant_type: lead.grid_applicant_type || null,
    grid_document_checklist: lead.grid_document_checklist || null,
    ...Object.fromEntries(GRID_TIE_MILESTONES.map(m => [m.key, lead[m.key] ? String(lead[m.key]).slice(0, 10) : null])),
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
    onProgressChange?.(getGridTieProgress(applicantType, payload.grid_document_checklist));
  }, [applicantType, onProgressChange, payload.grid_document_checklist]);

  const updateChecklistItem = useCallback((id: string, patch: Partial<GridTieChecklistEntry>) => {
    setChecklist(current => ({ ...current, [id]: { ...current[id], ...patch } }));
  }, []);

  const updateChecklistField = useCallback((id: string, key: string, value: string) => {
    setChecklist(current => {
      const entry = current[id] || {};
      return { ...current, [id]: { ...entry, fields: { ...entry.fields, [key]: value } } };
    });
  }, []);

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

  const ready = Boolean(applicantType);

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
          <select value={utility} onChange={event => setUtility(event.target.value)} className="h-11 w-full rounded-lg border border-gray-200 bg-white px-3 focus:border-primary focus:outline-none">
            <option value="">— เลือก —</option><option value="MEA">MEA (นครหลวง)</option><option value="PEA">PEA (ส่วนภูมิภาค)</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">เลขที่ใบรับ</label>
          <input value={appNo} onChange={event => setAppNo(event.target.value)} placeholder="XXX-XXXX" className="h-11 w-full rounded-lg border border-gray-200 px-3 font-mono focus:border-primary focus:outline-none" />
        </div>
      </div>

      <div>
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
      </div>

      {applicantType === "juristic" && (
        <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
          <div className="text-sm font-bold text-violet-800">ชุดเอกสารนิติบุคคล</div>
          <div className="text-xxs text-violet-600">เอกสารฝั่งลูกค้าล้วน ไม่มีส่วนงานหน้างานและอุปกรณ์ — ฟอร์มของทีม Permit ใช้กับบุคคลธรรมดา</div>
        </div>
      )}

      {ready ? (
        <ChecklistPanel
          items={checklistItems}
          value={checklist}
          lead={lead}
          specs={systemSpecs}
          utility={utility}
          applicantType={applicantType}
          onChange={updateChecklistItem}
          onFieldChange={updateChecklistField}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-5 text-center">
          <div className="text-sm font-semibold text-gray-600">เลือกประเภทผู้ยื่น</div>
          <div className="mt-1 text-xs text-gray-400">ระบบจะแสดง Checklist เอกสารของชุดนั้น</div>
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

      {mode === "final" && (
        <MilestoneDates
          value={milestones}
          onChange={(key, next) => setMilestones(current => ({ ...current, [key]: next }))}
        />
      )}

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

/**
 * ขั้นตอนกับการไฟฟ้าหลังยื่นคำขอ — 5 วันที่ตาม GRID_TIE_MILESTONES
 * แสดงเฉพาะ mode "final" เพราะตอน Step 5 (ส่งมอบงานติดตั้ง) ยังไม่มีวันไหนเกิดขึ้น
 * เตือนเมื่อวันย้อนหลังกว่าขั้นก่อนหน้า แต่ไม่บล็อก — งานจริงมีเคสลำดับสลับได้
 */
function MilestoneDates({ value, onChange }: {
  value: Record<string, string>;
  onChange: (key: GridTieMilestoneKey, next: string) => void;
}) {
  const outOfOrder = new Set(getGridTieOutOfOrderMilestones(value));
  const done = GRID_TIE_MILESTONES.filter(m => value[m.key]).length;

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2.5">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500">ขั้นตอนกับการไฟฟ้า</div>
          <div className="mt-0.5 text-xxs text-gray-400">บันทึกวันที่เมื่อแต่ละขั้นเสร็จ · ไม่บังคับกรอก</div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${done === GRID_TIE_MILESTONES.length ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
          {done}/{GRID_TIE_MILESTONES.length}
        </span>
      </div>
      <div className="divide-y divide-gray-100">
        {GRID_TIE_MILESTONES.map((milestone, index) => {
          const filled = Boolean(value[milestone.key]);
          const warn = outOfOrder.has(milestone.key);
          return (
            <div key={milestone.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <span className={filled ? "text-emerald-600" : "text-gray-300"}>{filled ? "●" : "○"}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-800">{index + 1}. {milestone.label}</div>
                {warn && <div className="text-xxs font-semibold text-amber-600">วันที่ย้อนหลังกว่าขั้นก่อนหน้า — ตรวจอีกครั้ง</div>}
              </div>
              <input
                type="date"
                value={value[milestone.key] || ""}
                onChange={event => onChange(milestone.key, event.target.value)}
                className={`h-9 w-40 rounded-lg border px-2 text-sm focus:outline-none ${warn ? "border-amber-400" : "border-gray-200 focus:border-primary"}`}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

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

function ChecklistPanel({
  items, value, lead, specs, utility, applicantType, onChange, onFieldChange,
}: {
  items: GridTieChecklistItem[];
  value: GridTieChecklistState;
  lead: Lead;
  specs: SystemSpecs | null;
  utility: string;
  applicantType: string;
  onChange: (id: string, patch: Partial<GridTieChecklistEntry>) => void;
  onFieldChange: (id: string, key: string, value: string) => void;
}) {
  // ชุดนิติบุคคลใช้หน้าตาเดิมของแอป — ไม่มีคอลัมน์ Permit, ป้ายกำกับ, ปุ่มแนบไฟล์
  const legacy = applicantType === "juristic";
  const counted = items.filter(item => !item.conditional || value[item.id]?.required);
  const receivedCount = counted.filter(item => value[item.id]?.received).length;
  const permitCount = counted.filter(item => value[item.id]?.permit === "has").length;
  const docItems = items.filter(item => item.section === "doc");
  const equipmentItems = items.filter(item => item.section === "equipment");

  const renderRows = (rows: GridTieChecklistItem[], offset: number) => rows.map((item, index) => (
    <ChecklistRow
      key={item.id} item={item} index={offset + index + 1} lead={lead} specs={specs} legacy={legacy}
      entry={value[item.id] || {}} onChange={onChange} onFieldChange={onFieldChange}
    />
  ));

  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2.5">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-gray-500">
            {legacy ? "Checklist เอกสารลูกค้า" : "Checklist เอกสารยื่นขอขนานไฟ"}
          </div>
          <div className="mt-0.5 text-xxs text-gray-400">
            {legacy
              ? `${utility || "—"} · ตรวจรับก่อนจัดชุดยื่นขอขนานไฟ`
              : "บุคคลธรรมดา · เครื่องมือติดตามงาน ไม่บังคับให้ครบก่อนปิดงาน"}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${receivedCount === counted.length ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"}`}>
            {legacy ? `${receivedCount}/${counted.length} ได้รับแล้ว` : `ตรวจรับ ${receivedCount}/${counted.length}`}
          </span>
          {!legacy && (
            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${permitCount === counted.length ? "border-emerald-200 bg-emerald-100 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
              Permit {permitCount}/{counted.length}
            </span>
          )}
        </div>
      </div>

      {!legacy && (
        <div className="hidden gap-2 border-b border-gray-100 px-3 py-1.5 text-xxs font-bold uppercase tracking-wide text-gray-400 md:grid md:grid-cols-[minmax(260px,1fr)_216px_148px_minmax(150px,0.6fr)]">
          <div>เอกสาร</div><div>ตรวจรับ</div><div>Permit</div><div>หมายเหตุ</div>
        </div>
      )}

      <div className="divide-y divide-gray-100">{renderRows(docItems, 0)}</div>

      {equipmentItems.length > 0 && (
        <>
          <div className="border-y border-gray-200 bg-gray-50 px-3 py-1.5 text-xxs font-bold uppercase tracking-wider text-gray-500">
            รายละเอียดทางเทคนิค · สเปคและรูปอุปกรณ์ที่ติดตั้ง / Datasheet
          </div>
          <div className="divide-y divide-gray-100">{renderRows(equipmentItems, docItems.length)}</div>
        </>
      )}
    </section>
  );
}

function ChecklistRow({
  item, index, lead, specs, legacy, entry, onChange, onFieldChange,
}: {
  item: GridTieChecklistItem;
  index: number;
  lead: Lead;
  specs: SystemSpecs | null;
  legacy: boolean;
  entry: GridTieChecklistEntry;
  onChange: (id: string, patch: Partial<GridTieChecklistEntry>) => void;
  onFieldChange: (id: string, key: string, value: string) => void;
}) {
  const isRequired = !item.conditional || entry.required === true;
  const defaults = autofillFor(item, lead, specs);

  return (
    <div className={`grid grid-cols-1 gap-2 px-3 py-2.5 md:items-start ${
      legacy ? "md:grid-cols-[minmax(280px,1fr)_minmax(230px,300px)_minmax(180px,0.75fr)]"
             : "md:grid-cols-[minmax(260px,1fr)_216px_148px_minmax(150px,0.6fr)]"
    } ${isRequired ? "bg-white" : "bg-gray-50/70"}`}>
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-xs font-bold text-gray-400">{index}.</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-800">{item.label}</div>
            {item.detail && <div className="mt-0.5 text-xs text-gray-500">{item.detail}</div>}

            {item.fields && !legacy && (() => {
              // เส้นประ = "ตรงนี้เขียน" ใช้ภาษาเดียวกับฟอร์มกระดาษที่ทีมถืออยู่
              // ค่าที่ระบบเติมให้แสดงเป็นสีฟ้า เพื่อแยกจากช่องที่ต้องกรอกเอง
              return (
                <div className="mt-2">
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                    {item.fields.map(field => {
                      const typed = entry.fields?.[field.key];
                      const auto = typed === undefined || typed === "" ? defaults[field.key] : undefined;
                      const current = typed ?? defaults[field.key] ?? "";
                      const inputTone = auto ? "text-blue-700" : "text-gray-800";
                      return (
                        <label
                          key={field.key}
                          title={auto ? "ระบบเติมให้จากขั้นตอนก่อนหน้า — แก้ทับได้" : undefined}
                          className="inline-flex items-baseline gap-1.5 text-xxs text-gray-500"
                        >
                          <span className="whitespace-nowrap">{field.label}</span>
                          {field.options ? (
                            <select
                              value={current}
                              onChange={event => onFieldChange(item.id, field.key, event.target.value)}
                              className={`border-b border-dotted border-gray-400 bg-transparent pb-0.5 font-semibold focus:border-solid focus:border-primary focus:outline-none ${inputTone} ${field.wide ? "w-40" : "w-24"}`}
                            >
                              <option value="">—</option>
                              {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                          ) : (
                            <input
                              value={current}
                              placeholder={field.placeholder}
                              onChange={event => onFieldChange(item.id, field.key, event.target.value)}
                              className={`border-b border-dotted border-gray-400 bg-transparent pb-0.5 font-semibold placeholder:font-normal placeholder:text-gray-300 focus:border-solid focus:border-primary focus:outline-none ${inputTone} ${field.wide ? "w-44" : "w-24"}`}
                            />
                          )}
                          {field.suffix && <span className="whitespace-nowrap">{field.suffix}</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {item.conditional && (
              <label className="mt-1 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-600">
                <input type="checkbox" checked={isRequired} onChange={event => onChange(item.id, { required: event.target.checked })} className="h-4 w-4" />
                จำเป็นสำหรับงานนี้
              </label>
            )}

          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={!isRequired} onClick={() => onChange(item.id, { received: true })}
          className={`h-9 rounded-lg border text-sm font-semibold disabled:opacity-40 ${entry.received && isRequired ? "border-emerald-500 bg-emerald-500 text-white" : "border-gray-200 bg-white text-gray-600"}`}>
          ได้รับแล้ว
        </button>
        <button type="button" disabled={!isRequired} onClick={() => onChange(item.id, { received: false })}
          className={`h-9 rounded-lg border text-sm font-semibold disabled:opacity-40 ${!entry.received && isRequired ? "border-red-500 bg-red-500 text-white" : "border-gray-200 bg-white text-gray-600"}`}>
          ยังไม่ได้รับ
        </button>
      </div>

      {!legacy && (
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onChange(item.id, { permit: entry.permit === "has" ? null : "has" })}
            className={`h-9 rounded-lg border text-xs font-semibold ${entry.permit === "has" ? "border-amber-600 bg-amber-600 text-white" : "border-gray-200 bg-white text-gray-600"}`}>
            มี
          </button>
          <button type="button" onClick={() => onChange(item.id, { permit: entry.permit === "none" ? null : "none" })}
            className={`h-9 rounded-lg border text-xs font-semibold ${entry.permit === "none" ? "border-gray-500 bg-gray-500 text-white" : "border-gray-200 bg-white text-gray-600"}`}>
            ไม่มี
          </button>
        </div>
        {item.datasheet && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xxs font-semibold text-gray-500">
            <input type="checkbox" checked={entry.datasheet === "has"} onChange={event => onChange(item.id, { datasheet: event.target.checked ? "has" : "none" })} className="h-3.5 w-3.5" />
            มี Datasheet
          </label>
        )}
      </div>
      )}

      <input value={entry.note ?? ""} disabled={!isRequired} onChange={event => onChange(item.id, { note: event.target.value })}
        placeholder="หมายเหตุ" className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm disabled:bg-gray-100" />
    </div>
  );
}

