"use client";
// InstallChecklist — รายละเอียดตรวจสอบงานติดตั้งระบบโซลาร์เซลล์.
//
// Mirrors the paper form (3 sections + notes + 2 signatures). All structured
// data on §1/§2/§3 lives in 3 JSON columns on install_checklists; this
// component owns the parsing/stringifying. Same UX pattern as PreSurveyForm
// (debounced autosave, 7-col grid, chip toggles for pass/fail).
//
// "Submitted" state (submitted_at set) makes the form readonly and unlocks
// the warranty step downstream; today the lock just disables inputs.

import { Fragment, useEffect, useRef, useState } from "react";
import { apiFetch, getUserIdHeader } from "@/lib/api";
import { formatThaiDate } from "@/lib/utils/formatters";
import { BoltIcon, CameraIcon, CheckIcon, DocumentIcon } from "@/components/ui/icons";
import { compressImage } from "@/lib/utils/compressImage";
import { INVERTER_BRANDS, INVERTER_KW_SIZES, PANEL_BRANDS, PHASE_LABEL } from "@/lib/constants/survey-options";
import Dropdown from "@/components/ui/Dropdown";
import NumberStepper from "@/components/ui/NumberStepper";
import { AddDeviceModal } from "@/components/lead/detail/SerialsUploader";

type Lead = Record<string, unknown>;

interface Props {
  lead: Lead;
  leadId: number;
}

// ── Shapes for the JSON columns ────────────────────────────────────────────
type PassNote = { pass: boolean | null; note?: string };

type SystemSpecs = {
  inverter?: { brand?: string; model?: string; kw?: number | null; phase?: string; sn?: string };
  panel?:    { brand?: string; model?: string; count?: number | null; watt?: number | null; total_kwp?: number | null };
  battery?:  { brand?: string; model?: string; kwh?: number | null };
  ac_dc_box_ongrid?: Record<string, { amp?: number | null; sqmm?: number | null }>;
  ac_dc_box_hybrid?: Record<string, { amp?: number | null; sqmm?: number | null }>;
};

type VisualChecks = Record<string, PassNote>;

type FunctionTests = {
  voltage_1ph?: { ln?: number | null };
  voltage_3ph?: { l1n?: number | null; l1l2?: number | null; l3n?: number | null; l1l3?: number | null; l2n?: number | null; l2l3?: number | null };
  meter_size?: string | null;
  meter_amp?: number | null;
  current_kw?: number | null;
  pv1_volt?: number | null;
  pv2_volt?: number | null;
  inverter_ip?: PassNote;
  smart_meter_reverse?: PassNote;
  wifi_app?: PassNote;
  app_solar?: PassNote;
};

// Section 2 item list — keys match the JSON column structure.
const VISUAL_ITEMS = [
  { key: "panel_pos",        label: "2.1 ระยะ / ตำแหน่งติดตั้ง แผงโซลาร์เซลล์ ได้ระดับ ได้แนว เรียบร้อย" },
  { key: "inverter_pos",     label: "2.2 ระยะ / ตำแหน่งติดตั้ง INVERTER ได้ระดับ ได้แนว เรียบร้อย" },
  { key: "control_box_pos",  label: "2.3 ระยะ / ตำแหน่งติดตั้ง ตู้ควบคุม ได้ระดับ / ภายในเก็บงานเรียบร้อย" },
  { key: "battery_pos",      label: "2.4 ระยะ / ตำแหน่งติดตั้ง BATTERY ได้ระดับ ได้แนว เรียบร้อย" },
  { key: "junction_box",     label: "2.5 JUNCTION BOX ติดตั้งครบและเรียบร้อย ใช้งานได้สมบูรณ์ (หน้าบ้าน / หลังบ้าน)" },
  { key: "pipe_install",     label: "2.6 งานเดินท่อ ติดตั้งแข็งแรง ได้ระดับ ได้แนว เรียบร้อย" },
  { key: "wire_way",         label: "2.7 งานติดตั้งราง WIRE WAY (กรณีมี) งานติดตั้งเรียบร้อย / เชื่อมกราวด์รางเรียบร้อย" },
  { key: "ground_weld",      label: "2.8 งานติดตั้งกราวด์เชื่อมต่อเก็บงานเรียบร้อย (เชื่อมโดยเทอร์มิเวล)" },
  { key: "terminal_breaker", label: "2.9 จุดเชื่อมต่อสาย TERMINAL และ BREAKER เชื่อมต่อเรียบร้อย" },
  { key: "dc_pipe",          label: "2.10 งานเดินท่อและตำแหน่งเชื่อมต่อ BOX / ท่อ สาย DC หลังบ้านชั้น 2 เก็บงานเรียบร้อย" },
];

const ONGRID_BREAKERS = [
  { key: "mcb_dc_solar", label: "MCB DC SOLAR" },
  { key: "mcb_rcbo_ac",  label: "MCB RCBO AC" },
  { key: "mcb_dc",       label: "MCB DC" },
  { key: "mcb_ac_grid",  label: "MCB AC GRID" },
];

const HYBRID_BREAKERS = [
  { key: "mcb_dc_solar",  label: "MCB DC SOLAR" },
  { key: "ats",           label: "ATS" },
  { key: "mcb_rcbo_ac",   label: "MCB RCBO AC" },
  { key: "mcb_dc",        label: "MCB DC" },
  { key: "mcb_ac_grid",   label: "MCB AC GRID" },
  { key: "mcb_ac_backup", label: "MCB AC BACK UP" },
];

const FUNCTION_PASS_FAIL = [
  { key: "inverter_ip",         label: "3.5 ทดสอบการเชื่อมต่อ INVERTER ผ่าน IP ของเครื่อง" },
  { key: "smart_meter_reverse", label: "3.6 ทดสอบการทำงานของ SMART METER ในส่วนกันกระแสไหลย้อน" },
  { key: "wifi_app",            label: "3.7 ทดสอบการเชื่อมต่อ WIFI ผ่าน APP ของเครื่อง ใช้งานได้ปกติ" },
  { key: "app_solar",           label: "3.8 ทำการเชื่อมต่อ APP SOLAR ให้กับลูกค้า ดูค่าพลังงาน ได้ปกติ" },
];

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

// ── Component ──────────────────────────────────────────────────────────────
export default function InstallChecklist({ lead, leadId }: Props) {
  const [loading, setLoading] = useState(true);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const locked = !!submittedAt;

  // Doc-no is minted lazily via /api/leads/:id/doc-no/mint?type=install_checklist
  // and stored on leads.install_checklist_doc_no. Hydrated from the lead prop;
  // first mount kicks the mint endpoint to assign one if none exists yet.
  const [docNo, setDocNo] = useState<string>(() => {
    const v = (lead as Record<string, unknown>).install_checklist_doc_no;
    return typeof v === "string" ? v : "";
  });
  const [inspectionDate, setInspectionDate] = useState("");
  const [specs, setSpecs] = useState<SystemSpecs>({});
  const [checks, setChecks] = useState<VisualChecks>({});
  const [tests, setTests] = useState<FunctionTests>({});
  const [notes, setNotes] = useState("");
  const [inspectorSig, setInspectorSig] = useState<string | null>(null);
  const [customerSig, setCustomerSig] = useState<string | null>(null);
  const [snScanning, setSnScanning] = useState(false);
  // AI wizard popup for Inverter — same modal as the Equipment-Serial tab.
  // After confirm, the brand/kW/SN mirror back into the §1.1 inputs.
  const [openInverterWizard, setOpenInverterWizard] = useState(false);
  const saveInverterFromWizard = async (
    items: Array<{ brand: string | null; serial_no: string | null; kw?: number | null; kwh?: number | null }>
  ): Promise<{ added: number; dupes: number; reason?: string }> => {
    // Install checklist's source of truth for inverter is the JSON in
    // install_checklists.system_specs. Mirror the confirmed values into that
    // state — autosave will persist. We don't write to lead_inverters here;
    // the Equipment-Serial tab + warranty wizard own that table.
    const first = items[0];
    if (!first?.serial_no) {
      return { added: 0, dupes: 0, reason: "ไม่มี Serial" };
    }
    // Normalise the brand against the catalogue so case mismatches from OCR
    // (e.g. "HUAWEI") match the Dropdown options ("Huawei") and the chip
    // shows as selected. Falls back to the raw value for custom brands not
    // in the catalogue.
    const brandFromWizard = first.brand
      ? (INVERTER_BRANDS.find(b => b.toLowerCase() === first.brand!.toLowerCase()) ?? first.brand)
      : undefined;
    // Use setSpecs directly (setSpec is declared later in this component, so
    // it's not in scope at this point — same render-order tradeoff). All
    // `null` values from the wizard payload are coerced to `undefined` so
    // they match SystemSpecs' optional-string fields (TypeScript otherwise
    // refuses `string | null` for a `string | undefined` slot).
    setSpecs(prev => ({
      ...prev,
      inverter: {
        ...(prev.inverter || {}),
        brand: brandFromWizard ?? prev.inverter?.brand,
        kw:    first.kw ?? prev.inverter?.kw,
        sn:    first.serial_no ?? undefined,
      },
    }));
    setOpenInverterWizard(false);
    return { added: 1, dupes: 0 };
  };

  // OCR a single inverter SN from a photo. Same recipe as WarrantyStep:
  // upload temp file → /api/ocr-serial → drop the temp file once we have the
  // string. The OCR target lives inside the system_specs JSON, so we
  // patch it via setSpec("inverter", { sn: ... }).
  const handleSnPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    setSnScanning(true);
    try {
      const compressed = await compressImage(file).catch(() => file);
      const fd = new FormData();
      fd.append("file", compressed);
      fd.append("lead_id", String(leadId));
      fd.append("type", "install_checklist_sn_scan");
      const up = await apiFetch("/api/upload", { method: "POST", body: fd });
      if (!up.url) return;
      const ocr = await apiFetch("/api/ocr-serial", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: up.url }),
      });
      if (ocr?.serial) setSpecs(prev => ({ ...prev, inverter: { ...(prev.inverter || {}), sn: ocr.serial } }));
      fetch(`/api/upload?file=${encodeURIComponent(up.url)}`, { method: "DELETE", headers: { ...getUserIdHeader() } }).catch(() => {});
    } finally { setSnScanning(false); }
  };

  // Hydrate once from the API. Empty server-side state still returns an empty
  // shell; we don't need a "not-found" branch.
  useEffect(() => {
    apiFetch(`/api/install-checklist/${leadId}`)
      .then(async (d: Record<string, unknown>) => {
        // doc_no lives on leads.install_checklist_doc_no now (mintDocNo).
        // The checklist GET no longer returns it; rely on the lead prop.
        // Default to today's date when the checklist has no inspection_date
        // yet — surveyors usually fill the form on the day of inspection, so
        // pre-filling saves a tap and the autosave persists it on first edit.
        setInspectionDate(
          typeof d.inspection_date === "string" && d.inspection_date
            ? String(d.inspection_date).slice(0, 10)
            : new Date().toISOString().slice(0, 10)
        );
        const parsedSpecs = safeParse<SystemSpecs>(d.system_specs as string | null, {});
        // Pre-fill panel.brand + battery.brand from lead_panels / lead_batteries
        // (Equipment-Serial tab) when the install checklist doesn't have its
        // own values yet. Serials captured there already carry the brand on
        // each row — pull the first one as the canonical value so the
        // surveyor doesn't re-type.
        if (!parsedSpecs.panel?.brand || !parsedSpecs.panel?.count || !parsedSpecs.battery?.brand || parsedSpecs.battery?.kwh == null) {
          try {
            const dev = await apiFetch(`/api/leads/${leadId}/devices`) as {
              panels?: Array<{ brand: string | null }>;
              batteries?: Array<{ brand: string | null; kwh: number | null }>;
            };
            // Panel: brand + count "for free" — each row in lead_panels = one panel.
            if (!parsedSpecs.panel?.brand) {
              const panelBrand = dev.panels?.find(p => p.brand)?.brand;
              if (panelBrand) parsedSpecs.panel = { ...(parsedSpecs.panel || {}), brand: panelBrand };
            }
            if (!parsedSpecs.panel?.count && dev.panels && dev.panels.length > 0) {
              parsedSpecs.panel = { ...(parsedSpecs.panel || {}), count: dev.panels.length };
            }
            // Battery: brand + kWh from the first row that carries each value.
            if (!parsedSpecs.battery?.brand) {
              const batteryBrand = dev.batteries?.find(b => b.brand)?.brand;
              if (batteryBrand) parsedSpecs.battery = { ...(parsedSpecs.battery || {}), brand: batteryBrand };
            }
            if (parsedSpecs.battery?.kwh == null) {
              const batteryKwh = dev.batteries?.find(b => typeof b.kwh === "number")?.kwh;
              if (typeof batteryKwh === "number") parsedSpecs.battery = { ...(parsedSpecs.battery || {}), kwh: batteryKwh };
            }
          } catch { /* devices fetch is best-effort — silent fail keeps the checklist usable */ }
        }
        setSpecs(parsedSpecs);
        setChecks(safeParse<VisualChecks>(d.visual_checks as string | null, {}));
        const parsedTests = safeParse<FunctionTests>(d.function_tests as string | null, {});
        // Pre-fill meter_size from the survey when the install checklist
        // doesn't have its own value yet — surveyor already captured this on
        // the pre-survey form (lead.meter_size). User can override.
        if (!parsedTests.meter_size) {
          const surveyMeter = (lead as Record<string, unknown>).meter_size;
          if (typeof surveyMeter === "string" && surveyMeter) parsedTests.meter_size = surveyMeter;
        }
        setTests(parsedTests);
        setNotes(typeof d.notes === "string" ? d.notes : "");
        setInspectorSig(typeof d.inspector_signature_url === "string" ? d.inspector_signature_url : null);
        setCustomerSig(typeof d.customer_signature_url === "string" ? d.customer_signature_url : null);
        setSubmittedAt(typeof d.submitted_at === "string" ? d.submitted_at : null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [leadId]);

  // Mint a doc-no on first visit so the checklist always has one to display.
  // Idempotent: the endpoint returns the existing value if one is already
  // stored on the lead, so re-mounts don't burn counters.
  useEffect(() => {
    if (docNo) return;
    apiFetch(`/api/leads/${leadId}/doc-no/mint?type=install_checklist`, { method: "POST" })
      .then((r: { docNo?: string | null }) => { if (r?.docNo) setDocNo(r.docNo); })
      .catch(console.error);
  }, [leadId, docNo]);

  // Install checklist is the source of truth for "what was actually installed"
  // (inverter brand/kW/phase/SN, panel brand/count/watt/kWp). Warranty step
  // mirrors from here as its defaults — see the mirror useEffect in WarrantyStep.
  // No prefill on this side: the technician records what's on-site.

  // Debounced autosave. Skip the first render so hydrate doesn't trigger a
  // pointless PATCH back to the server.
  const isFirst = useRef(true);
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (loading) return;
    if (isFirst.current) { isFirst.current = false; return; }
    if (locked) return;
    if (pendingRef.current) clearTimeout(pendingRef.current);
    pendingRef.current = setTimeout(() => {
      apiFetch(`/api/install-checklist/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // doc_no is NOT in this payload — it lives on leads.install_checklist_doc_no
          // and is owned by mintDocNo, not this PATCH endpoint.
          inspection_date: inspectionDate || null,
          system_specs: JSON.stringify(specs),
          visual_checks: JSON.stringify(checks),
          function_tests: JSON.stringify(tests),
          notes: notes || null,
          inspector_signature_url: inspectorSig,
          customer_signature_url: customerSig,
        }),
      }).catch(console.error);
    }, 600);
    return () => { if (pendingRef.current) clearTimeout(pendingRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docNo, inspectionDate, specs, checks, tests, notes, inspectorSig, customerSig]);

  // Helpers for nested edits — keep the JSON-shape immutable and let React
  // do change detection.
  const setSpec = <T extends keyof SystemSpecs>(key: T, value: SystemSpecs[T]) =>
    setSpecs(prev => ({ ...prev, [key]: { ...(prev[key] || {}), ...(value || {}) } }));
  const setBreaker = (group: "ac_dc_box_ongrid" | "ac_dc_box_hybrid", key: string, field: "amp" | "sqmm", v: number | null) =>
    setSpecs(prev => ({
      ...prev,
      [group]: { ...(prev[group] || {}), [key]: { ...(prev[group]?.[key] || {}), [field]: v } },
    }));
  const setCheck = (key: string, field: "pass" | "note", v: boolean | string | null) =>
    setChecks(prev => ({ ...prev, [key]: { ...(prev[key] || { pass: null }), [field]: v } }));

  // Mirror the latest state into a ref so the unmount cleanup can see it
  // (the cleanup runs once at teardown, but closures freeze; without this
  // it would only read first-render values).
  const latestRef = useRef({ inspectionDate, specs, checks, tests, notes, inspectorSig, customerSig });
  useEffect(() => {
    latestRef.current = { inspectionDate, specs, checks, tests, notes, inspectorSig, customerSig };
  }, [inspectionDate, specs, checks, tests, notes, inspectorSig, customerSig]);

  // Flush any pending debounced save on unmount (closing the Install step,
  // navigating to a different lead, etc) so the last edit isn't lost in the
  // 600ms timer window.
  useEffect(() => {
    return () => {
      if (!pendingRef.current) return;
      clearTimeout(pendingRef.current);
      pendingRef.current = null;
      const s = latestRef.current;
      apiFetch(`/api/install-checklist/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspection_date: s.inspectionDate || null,
          system_specs: JSON.stringify(s.specs),
          visual_checks: JSON.stringify(s.checks),
          function_tests: JSON.stringify(s.tests),
          notes: s.notes || null,
          inspector_signature_url: s.inspectorSig,
          customer_signature_url: s.customerSig,
        }),
      }).catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <div className="p-6 text-center text-sm text-gray-400">กำลังโหลด checklist…</div>;
  }

  const sectionCls = "rounded-lg bg-white/60 border border-active/15 p-3";
  const sectionTitle = "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2";
  const sectionIconWrap = "w-7 h-7 rounded-lg bg-active/10 text-active flex items-center justify-center shrink-0";
  const subCardTitle = "text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5";
  const subCardIconWrap = "w-5 h-5 rounded-md bg-active/10 text-active flex items-center justify-center shrink-0";
  const fieldLabel = "text-xs text-gray-500 block mb-1";
  const inputCls = "w-full h-8 px-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary disabled:bg-gray-50 disabled:text-gray-500";

  return (
    <div className="space-y-3">
      {locked && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span>ส่งมอบงานแล้ว เมื่อ {formatThaiDate(submittedAt, { time: true })} — checklist ถูก lock</span>
        </div>
      )}

      {/* Header */}
      <div className={sectionCls}>
        <div className={sectionTitle}>
          <span className={sectionIconWrap}><DocumentIcon className="w-4 h-4" /></span>
          DOCUMENT HEADER
        </div>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          <div className="col-span-2 md:col-span-1 flex flex-col gap-1">
            <label className={fieldLabel}>เลขที่เอกสาร</label>
            <input type="text" value={docNo} readOnly placeholder={docNo ? "" : "กำลังออกเลข…"}
              className={inputCls + " font-mono bg-gray-50 text-gray-700"} />
          </div>
          <div className="col-span-2 md:col-span-1 flex flex-col gap-1">
            <label className={fieldLabel}>วันที่ตรวจ</label>
            <input type="date" value={inspectionDate} onChange={e => setInspectionDate(e.target.value)} disabled={locked} className={inputCls} />
          </div>
        </div>
      </div>

      {/* §1 System Specs */}
      <div className={sectionCls}>
        <div className={sectionTitle}>
          <span className={sectionIconWrap}><BoltIcon className="w-4 h-4" /></span>
          SYSTEM SPECIFICATIONS
        </div>

        <div className="space-y-3">
          {/* INVERTER — dropdowns for brand / size / phase fit 3 fields in one
              7-col row; SN row underneath with AI camera scan. */}
          <div className="rounded-lg border border-gray-200 bg-white/50 p-3 space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">1.1 INVERTER</div>

            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              <div className="col-span-1 md:col-span-1">
                <label className={fieldLabel}>ยี่ห้อ</label>
                <Dropdown
                  value={specs.inverter?.brand ?? ""}
                  onChange={v => setSpec("inverter", { brand: v })}
                  options={INVERTER_BRANDS.map(b => ({ value: b, label: b }))}
                  disabled={locked}
                />
              </div>
              <div className="col-span-1 md:col-span-1">
                <label className={fieldLabel}>ขนาด (kW)</label>
                <Dropdown
                  value={specs.inverter?.kw != null ? String(specs.inverter.kw) : ""}
                  onChange={v => setSpec("inverter", { kw: v ? parseFloat(v) : null })}
                  options={INVERTER_KW_SIZES.map(kw => ({ value: String(kw), label: `${kw} kW` }))}
                  disabled={locked}
                  buttonClassName="font-mono tabular-nums"
                />
              </div>
              <div className="col-span-1 md:col-span-1">
                <label className={fieldLabel}>Phase <span className="text-red-500">*</span></label>
                <Dropdown
                  value={specs.inverter?.phase ?? ""}
                  onChange={v => setSpec("inverter", { phase: v })}
                  options={Object.entries(PHASE_LABEL).map(([v, l]) => ({ value: v, label: l }))}
                  disabled={locked}
                />
              </div>
            </div>

            <div>
              <label className={fieldLabel}>Serial Number</label>
              <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                <input value={specs.inverter?.sn ?? ""} onChange={e => setSpec("inverter", { sn: e.target.value })} placeholder="HW1234567890" disabled={locked}
                  className="col-span-2 md:col-span-3 w-full h-8 px-3 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:border-primary disabled:bg-gray-50 disabled:text-gray-500" />
                <button type="button" onClick={() => setOpenInverterWizard(true)} disabled={locked}
                  title="AI อ่าน Serial"
                  className={`col-span-1 md:col-span-1 h-8 rounded-lg text-white bg-active flex items-center justify-center transition-colors ${locked ? "opacity-40 cursor-not-allowed" : "hover:brightness-110"}`}>
                  <span className="relative inline-flex items-center justify-center">
                    <CameraIcon className="w-5 h-5" strokeWidth={2} />
                    <svg className="absolute -top-1 -right-1 w-3 h-3 text-amber-300 drop-shadow" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0l2.4 7.6L22 10l-7.6 2.4L12 20l-2.4-7.6L2 10l7.6-2.4L12 0z" />
                    </svg>
                  </span>
                </button>
              </div>
              <div className="text-xs text-gray-400 mt-1">กดปุ่ม AI เพื่อถ่ายรูปฉลาก — ระบบจะอ่าน Serial และเติมยี่ห้อ/ขนาดให้อัตโนมัติ</div>
            </div>
          </div>

          {/* Panel — ยี่ห้อ dropdown + รุ่น/จำนวน/วัตต์/kWp in one 7-col row
              (2+2+1+1+1 = 7). */}
          <div className="rounded-lg border border-gray-200 bg-white/50 p-3 space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">1.3 SOLAR PANELS</div>

            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              <div className="col-span-1 md:col-span-1">
                <label className={fieldLabel}>ยี่ห้อ</label>
                <Dropdown
                  value={specs.panel?.brand ?? ""}
                  onChange={v => setSpec("panel", { brand: v })}
                  options={PANEL_BRANDS.map(b => ({ value: b, label: b }))}
                  disabled={locked}
                />
              </div>
              <div className="col-span-2 md:col-span-2"><label className={fieldLabel}>รุ่น</label>
                <input type="text" value={specs.panel?.model ?? ""} onChange={e => setSpec("panel", { model: e.target.value })} placeholder="JKM640N-66HL4M-BDV-Z1-EU" disabled={locked} className={inputCls} />
              </div>
              <div className="col-span-1 md:col-span-1"><label className={fieldLabel}>จำนวน (แผง)</label>
                <NumberStepper value={specs.panel?.count ?? null} onChange={v => setSpec("panel", { count: v })} disabled={locked} />
              </div>
              <div className="col-span-1 md:col-span-1"><label className={fieldLabel}>วัตต์/แผง</label>
                <input type="number" value={specs.panel?.watt ?? ""} onChange={e => setSpec("panel", { watt: e.target.value ? parseInt(e.target.value) : null })} disabled={locked} className={inputCls + " font-mono tabular-nums"} />
              </div>
              <div className="col-span-1 md:col-span-1"><label className={fieldLabel}>ขนาดติดตั้ง (kWp)</label>
                {/* Auto-computed from จำนวน × วัตต์ ÷ 1000 when both are set.
                    Stays editable only when one of the inputs is empty so a
                    surveyor can still type a system size when they don't yet
                    have a panel count or wattage on hand. */}
                {(() => {
                  const count = specs.panel?.count;
                  const watt  = specs.panel?.watt;
                  const auto  = typeof count === "number" && typeof watt === "number" && count > 0 && watt > 0;
                  const computed = auto ? Math.round((count * watt / 1000) * 100) / 100 : null;
                  // Sync the computed value into state so autosave persists it
                  // and downstream consumers (cert/report) read the same value.
                  if (auto && specs.panel?.total_kwp !== computed) {
                    queueMicrotask(() => setSpec("panel", { total_kwp: computed }));
                  }
                  return (
                    <input type="number" step="0.01"
                      value={auto ? (computed ?? "") : (specs.panel?.total_kwp ?? "")}
                      onChange={e => setSpec("panel", { total_kwp: e.target.value ? parseFloat(e.target.value) : null })}
                      disabled={locked || auto}
                      title={auto ? `คำนวณจาก ${count} × ${watt} ÷ 1000` : undefined}
                      className={inputCls + " font-mono tabular-nums" + (auto ? " bg-gray-50 text-gray-700" : "")} />
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Battery */}
          <div className="rounded-lg border border-gray-200 bg-white/50 p-3 space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">1.4 BATTERY</div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              <div className="col-span-1 md:col-span-1"><label className={fieldLabel}>ยี่ห้อ</label>
                <input type="text" value={specs.battery?.brand ?? ""} onChange={e => setSpec("battery", { brand: e.target.value })} disabled={locked} className={inputCls} />
              </div>
              <div className="col-span-1 md:col-span-2"><label className={fieldLabel}>รุ่น</label>
                <input type="text" value={specs.battery?.model ?? ""} onChange={e => setSpec("battery", { model: e.target.value })} disabled={locked} className={inputCls} />
              </div>
              <div className="col-span-1 md:col-span-1"><label className={fieldLabel}>ขนาด (kWh)</label>
                <input type="number" step="0.1" value={specs.battery?.kwh ?? ""} onChange={e => setSpec("battery", { kwh: e.target.value ? parseFloat(e.target.value) : null })} disabled={locked} className={inputCls + " font-mono tabular-nums"} />
              </div>
            </div>
          </div>

          {/* §1.5 AC/DC BOX ON GRID */}
          <BreakerGroup label="1.5 AC/DC BOX (ON GRID)" rows={ONGRID_BREAKERS}
            values={specs.ac_dc_box_ongrid || {}}
            onChange={(k, f, v) => setBreaker("ac_dc_box_ongrid", k, f, v)} locked={locked} />

          {/* §1.6 AC/DC BOX HYBRID */}
          <BreakerGroup label="1.6 AC/DC BOX (HYBRID)" rows={HYBRID_BREAKERS}
            values={specs.ac_dc_box_hybrid || {}}
            onChange={(k, f, v) => setBreaker("ac_dc_box_hybrid", k, f, v)} locked={locked} />
        </div>
      </div>

      {/* §2 Visual Checks */}
      <div className={sectionCls}>
        <div className={sectionTitle}>
          <span className={sectionIconWrap}><DocumentIcon className="w-4 h-4" /></span>
          VISUAL INSPECTION
        </div>
        <div className="space-y-2">
          {/* Each row: description label (col-span-3, text-heavy, can wrap)
              + ผ่าน (col-span-1) + ไม่ผ่าน (col-span-1) + note (col-span-2)
              = 7. Chips and inputs are all col-span-1 / atomic; description
              is the only cell that needs a wider slot for text. */}
          {VISUAL_ITEMS.map(item => {
            const v = checks[item.key] || { pass: null, note: "" };
            return (
              <div key={item.key} className="grid grid-cols-2 md:grid-cols-7 gap-2 items-center">
                <div className="col-span-2 md:col-span-3 text-xs text-gray-700">{item.label}</div>
                <button type="button" disabled={locked}
                  onClick={() => setCheck(item.key, "pass", v.pass === true ? null : true)}
                  className={`col-span-1 md:col-span-1 h-8 rounded-lg text-sm font-semibold border transition-all ${v.pass === true ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"}`}>
                  ผ่าน
                </button>
                <button type="button" disabled={locked}
                  onClick={() => setCheck(item.key, "pass", v.pass === false ? null : false)}
                  className={`col-span-1 md:col-span-1 h-8 rounded-lg text-sm font-semibold border transition-all ${v.pass === false ? "bg-red-500 text-white border-red-500" : "bg-white text-gray-600 border-gray-200 hover:border-red-300"}`}>
                  ไม่ผ่าน
                </button>
                <input type="text" value={v.note ?? ""} onChange={e => setCheck(item.key, "note", e.target.value)} placeholder="หมายเหตุ" disabled={locked}
                  className={`col-span-2 md:col-span-2 ${inputCls}`} />
              </div>
            );
          })}
        </div>
      </div>

      {/* §3 Function Tests */}
      <div className={sectionCls}>
        <div className={sectionTitle}>
          <span className={sectionIconWrap}><CheckIcon className="w-4 h-4" /></span>
          FUNCTION TESTS
        </div>

        <div className="space-y-3">
          {/* 3.1 — Voltage 1-phase + meter size. Labels match the paper form's
              "วัดแรงดัน VOLT AC TO LINE" descriptions so users see the same
              wording they're used to on the printed checklist. */}
          <div>
            <div className="text-xs font-semibold text-gray-500">3.1 แรงดันไฟฟ้ากรณีระบบไฟ 1 เฟส</div>
            <div className="text-[10px] text-gray-400 mb-1">วัดแรงดัน VOLT AC TO LINE</div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
              <MeasureField label="วัดแรงดัน (L:N)" value={tests.voltage_1ph?.ln ?? null} unit="Volt" disabled={locked}
                onChange={v => setTests(prev => ({ ...prev, voltage_1ph: { ...(prev.voltage_1ph || {}), ln: v } }))} />
              <div className="md:col-span-3 flex items-center gap-2">
                <span className="text-xs text-gray-700 shrink-0 w-36 text-right">ขนาดมิเตอร์ไฟฟ้า</span>
                <div className="flex-1">
                  <Dropdown
                    value={tests.meter_size ?? ""}
                    onChange={v => setTests(prev => ({ ...prev, meter_size: v || null }))}
                    options={[
                      { value: "15_45",   label: "15(45) A" },
                      { value: "30_100",  label: "30(100) A" },
                      { value: "other",   label: "อื่นๆ" },
                      { value: "unknown", label: "ไม่ทราบ" },
                    ]}
                    disabled={locked}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3.2 — Voltage 3-phase laid out 2 columns × 3 rows like the PDF.
              Left column: L1:N → L3:N → L2:N.  Right column: L1:L2 → L1:L3 → L2:L3. */}
          <div>
            <div className="text-xs font-semibold text-gray-500">3.2 แรงดันไฟฟ้ากรณีระบบไฟ 3 เฟส</div>
            <div className="text-[10px] text-gray-400 mb-1">วัดแรงดัน VOLT AC TO LINE</div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
              {([
                { k: "l1n",  label: "วัดแรงดัน (L1:N)" },
                { k: "l1l2", label: "วัดแรงดัน (L1:L2)" },
                { k: "l3n",  label: "วัดแรงดัน (L3:N)" },
                { k: "l1l3", label: "วัดแรงดัน (L1:L3)" },
                { k: "l2n",  label: "วัดแรงดัน (L2:N)" },
                { k: "l2l3", label: "วัดแรงดัน (L2:L3)" },
              ] as const).map(({ k, label }) => (
                <MeasureField key={k} label={label} value={tests.voltage_3ph?.[k] ?? null} unit="Volt" disabled={locked}
                  onChange={v => setTests(prev => ({ ...prev, voltage_3ph: { ...(prev.voltage_3ph || {}), [k]: v } }))} />
              ))}
            </div>
          </div>

          {/* 3.3 — Current power on its own row, then PV1 + PV2 together on
              the next row so the two PV strings sit side-by-side. */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500 mb-1">3.3 กำลังการผลิตที่วัดได้ ณ.ปัจจุบัน</div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
              <MeasureField label="กำลังการผลิต" value={tests.current_kw ?? null} unit="kW" step={0.01} disabled={locked}
                onChange={v => setTests(prev => ({ ...prev, current_kw: v }))} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
              <MeasureField label="แรงดัน PV1" value={tests.pv1_volt ?? null} unit="Volt" disabled={locked}
                onChange={v => setTests(prev => ({ ...prev, pv1_volt: v }))} />
              <MeasureField label="แรงดัน PV2" value={tests.pv2_volt ?? null} unit="Volt" disabled={locked}
                onChange={v => setTests(prev => ({ ...prev, pv2_volt: v }))} />
            </div>
          </div>

          {/* 3.5–3.8 pass/fail — same per-cell layout as §2 visual checks. */}
          <div className="space-y-2 pt-2 border-t border-gray-100">
            {FUNCTION_PASS_FAIL.map(item => {
              const v = (tests[item.key as keyof FunctionTests] as PassNote | undefined) || { pass: null, note: "" };
              return (
                <div key={item.key} className="grid grid-cols-2 md:grid-cols-7 gap-2 items-center">
                  <div className="col-span-2 md:col-span-3 text-xs text-gray-700">{item.label}</div>
                  <button type="button" disabled={locked}
                    onClick={() => setTests(prev => ({ ...prev, [item.key]: { ...((prev as Record<string, unknown>)[item.key] as PassNote || {}), pass: v.pass === true ? null : true } }))}
                    className={`col-span-1 md:col-span-1 h-8 rounded-lg text-sm font-semibold border transition-all ${v.pass === true ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"}`}>
                    ผ่าน
                  </button>
                  <button type="button" disabled={locked}
                    onClick={() => setTests(prev => ({ ...prev, [item.key]: { ...((prev as Record<string, unknown>)[item.key] as PassNote || {}), pass: v.pass === false ? null : false } }))}
                    className={`col-span-1 md:col-span-1 h-8 rounded-lg text-sm font-semibold border transition-all ${v.pass === false ? "bg-red-500 text-white border-red-500" : "bg-white text-gray-600 border-gray-200 hover:border-red-300"}`}>
                    ไม่ผ่าน
                  </button>
                  <input type="text" value={v.note ?? ""} onChange={e => setTests(prev => ({ ...prev, [item.key]: { ...((prev as Record<string, unknown>)[item.key] as PassNote || {}), note: e.target.value } }))} placeholder="หมายเหตุ" disabled={locked}
                    className={`col-span-2 md:col-span-2 ${inputCls}`} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Notes + signatures sections intentionally removed for v1. State
          (notes / inspectorSig / customerSig) is still wired into the
          autosave payload so the columns stay queryable from the API. */}

      {/* No submit button — autosave handles every change (debounced 600ms),
          and the unmount effect below flushes any pending edit so closing
          the Install step never loses the last keystroke. */}
      {openInverterWizard && (
        <AddDeviceModal
          type="inverters"
          onCancel={() => setOpenInverterWizard(false)}
          onSave={saveInverterFromWizard}
        />
      )}
    </div>
  );
}

// ── Measurement field — paper-form-style "label [input] unit" pair. Used
// for §3 voltage / power / current measurements. Spans 3 cols of the §3
// 6-col sub-grid so two fields fit per row, mirroring the PDF layout.
function MeasureField({ label, value, unit, step = 0.1, disabled, onChange }: {
  label: string;
  value: number | null;
  unit: string;
  step?: number;
  disabled?: boolean;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="md:col-span-3 flex items-center gap-2">
      <span className="text-xs text-gray-700 shrink-0 w-36 text-right">{label}</span>
      <div className="relative flex-1">
        <input type="number" step={step} value={value ?? ""} disabled={disabled}
          onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : null)}
          className="w-full h-8 pl-3 pr-12 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-primary disabled:bg-gray-50" />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">{unit}</span>
      </div>
    </div>
  );
}

// ── Breaker spec sub-card — Amp + cable Sq.mm per row. ──────────────────────
function BreakerGroup({ label, rows, values, onChange, locked }: {
  label: string;
  rows: { key: string; label: string }[];
  values: Record<string, { amp?: number | null; sqmm?: number | null }>;
  onChange: (key: string, field: "amp" | "sqmm", v: number | null) => void;
  locked: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white/50 p-3 space-y-2">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</div>
      {/* 7-col grid with a 1-col gutter between the two breakers per row:
          breaker(3) + spacer(1) + breaker(3) = 7. The spacer is an empty
          div inserted after every first-of-pair (even index). */}
      <div>
        <div className="grid grid-cols-3 md:grid-cols-7 gap-x-2 gap-y-1.5">
          {rows.map((row, i) => {
            const v = values[row.key] || {};
            return (
              <Fragment key={row.key}>
                <div className="col-span-1 md:col-span-1 text-xs text-gray-700 self-center truncate">{row.label}</div>
                <div className="relative col-span-1">
                  <input type="number" value={v.amp ?? ""} onChange={e => onChange(row.key, "amp", e.target.value ? parseInt(e.target.value) : null)} disabled={locked} placeholder="Amp"
                    className="w-full h-8 pl-3 pr-7 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-primary disabled:bg-gray-50" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">A</span>
                </div>
                <div className="relative col-span-1">
                  <input type="number" step="0.1" value={v.sqmm ?? ""} onChange={e => onChange(row.key, "sqmm", e.target.value ? parseFloat(e.target.value) : null)} disabled={locked} placeholder="Sq.mm"
                    className="w-full h-8 pl-3 pr-12 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-primary disabled:bg-gray-50" />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none">sq.mm</span>
                </div>
                {/* Gutter cell after the first breaker of every pair (even
                    index). Skipped on mobile (col-span-3 grid wraps anyway)
                    and after the last item so there's no trailing gap. */}
                {i % 2 === 0 && i < rows.length - 1 && (
                  <div className="hidden md:block md:col-span-1" aria-hidden />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
