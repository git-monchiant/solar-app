"use client";

import { useEffect, useState } from "react";
import { apiFetch, getUserIdHeader } from "@/lib/api";
import { useMe } from "@/lib/roles";
import type { StepCommonProps, Package } from "./types";
import ErrorPopup from "@/components/ui/ErrorPopup";
import FallbackImage from "@/components/ui/FallbackImage";
import StepLayout from "../StepLayout";
import SignaturePad from "../SignaturePad";
import WarrantyModal from "../WarrantyModal";
import LineConfirmModal from "@/components/modal/LineConfirmModal";
import { useSubStep } from "@/lib/hooks/useSubStep";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { buildWarrantyFlex } from "@/lib/utils/line-flex";

const SUB_STEPS = ["ข้อมูล", "แบตเตอรี่", "เอกสาร", "ลายเซ็น", "ยืนยัน"];

const formatDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH-u-ca-buddhist", { day: "numeric", month: "short", year: "numeric" });
};

const toISO = (d: Date) => d.toISOString().slice(0, 10);

// ISO (YYYY-MM-DD, ค.ศ.) → "DD-MM-YYYY" (พ.ศ.)
const isoToBE = (iso: string | null): string => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return "";
  const be = parseInt(y) + 543;
  return `${d}-${m}-${be}`;
};

// "DD-MM-YYYY" (พ.ศ.) → ISO "YYYY-MM-DD" (ค.ศ.). Returns null if invalid.
const beToISO = (be: string): string | null => {
  const m = be.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1]);
  const month = parseInt(m[2]);
  const year = parseInt(m[3]) - 543;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

// Auto-insert "-" as user types. Strip non-digits, cap at 8, then format DD-MM-YYYY.
function formatBEWithSeparators(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

function ThaiDateInput({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [text, setText] = useState(() => isoToBE(value));
  // Sync external value → local text when prop changes from outside.
  useEffect(() => {
    const formatted = isoToBE(value);
    if (formatted !== text) setText(formatted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const handleChange = (raw: string) => {
    const next = formatBEWithSeparators(raw);
    setText(next);
    const iso = beToISO(next);
    if (iso) onChange(iso);
  };
  const invalid = text.length > 0 && !beToISO(text);
  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={e => handleChange(e.target.value)}
      placeholder="DD-MM-YYYY (พ.ศ.)"
      maxLength={10}
      className={`w-full h-11 px-3 rounded-lg border font-mono tabular-nums focus:outline-none ${invalid ? "border-red-400 focus:border-red-500" : "border-gray-200 focus:border-primary"}`}
    />
  );
}

const addYears = (iso: string | null, years: number): string | null => {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  d.setFullYear(d.getFullYear() + years);
  return toISO(d);
};

interface Props extends StepCommonProps {
  packages: Package[];
  expanded?: boolean;
  onToggle?: () => void;
}

export default function WarrantyStep({ lead, state, refresh, packages, expanded, onToggle }: Props) {
  const { me } = useMe();
  const installedISO = lead.install_completed_at ? String(lead.install_completed_at).slice(0, 10) : null;
  const warrantyStartISO = lead.warranty_start_date ? String(lead.warranty_start_date).slice(0, 10) : null;
  const defaultStart = warrantyStartISO || installedISO || toISO(new Date());

  const [sn, setSn] = useState(lead.warranty_inverter_sn || "");
  const [docNo, setDocNo] = useState(lead.warranty_doc_no || `SSE${new Date().getFullYear().toString().slice(-2)}${String(lead.id).padStart(4, "0")}`);
  const [startDate, setStartDate] = useState(defaultStart);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [inverterCertUrl, setInverterCertUrl] = useState<string | null>(lead.warranty_inverter_cert_url);
  const [panelCertUrl, setPanelCertUrl] = useState<string | null>(lead.warranty_panel_cert_url);
  const [panelSerialsUrl, setPanelSerialsUrl] = useState<string | null>(lead.warranty_panel_serials_url);
  const [otherDocs, setOtherDocs] = useState<string[]>(lead.warranty_other_docs_url ? lead.warranty_other_docs_url.split(",").filter(Boolean) : []);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [nextError, setNextError] = useState<string | null>(null);
  const [subStep, setSubStep] = useSubStep(`warrantySubStep_${lead.id}`, 0, SUB_STEPS.length);
  const [lineSending, setLineSending] = useState(false);
  const [lineSent, setLineSent] = useState(false);
  const [lineConfirm, setLineConfirm] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const isMobile = useIsMobile();
  // Mobile → in-app modal (PdfPreview). Desktop → new tab (native PDF viewer
  // lets them scroll multi-page + search).
  const openWarranty = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isMobile) setPreviewOpen(true);
    else if (lead.warranty_doc_url) window.open(lead.warranty_doc_url, "_blank", "noreferrer");
  };

  // Equipment snapshot — editable; defaults from the surveyed package, but staff
  // can change to reflect what was actually installed on-site.
  const defaultPkg = packages.find(p => p.id === lead.interested_package_id);
  const [sysKwp, setSysKwp] = useState<number | "">(lead.warranty_system_size_kwp ?? defaultPkg?.kwp ?? "");
  const [panelCount, setPanelCount] = useState<number | "">(lead.warranty_panel_count ?? defaultPkg?.solar_panels ?? "");
  const [panelWatt, setPanelWatt] = useState<number | "">(lead.warranty_panel_watt ?? defaultPkg?.panel_watt ?? "");
  const [panelBrand, setPanelBrand] = useState<string>(lead.warranty_panel_brand ?? "");
  const [invBrand, setInvBrand] = useState<string>(lead.warranty_inverter_brand ?? defaultPkg?.inverter_brand ?? "");
  const [invKw, setInvKw] = useState<number | "">(lead.warranty_inverter_kw ?? defaultPkg?.inverter_kw ?? "");
  // Battery list — up to 5 units, each with brand/kwh/serial. Not required.
  const BATTERY_ROWS = 5;
  type Batt = { brand: string; kwh: string; serial: string };
  const emptyBatt: Batt = { brand: "", kwh: "", serial: "" };
  const initBatteries: Batt[] = (() => {
    try {
      const parsed = lead.warranty_batteries ? JSON.parse(lead.warranty_batteries) : [];
      if (Array.isArray(parsed)) {
        return Array.from({ length: BATTERY_ROWS }, (_, i) => ({
          brand: parsed[i]?.brand ?? (i === 0 ? (lead.warranty_battery_brand ?? defaultPkg?.battery_brand ?? "") : ""),
          kwh: parsed[i]?.kwh != null ? String(parsed[i].kwh) : (i === 0 ? String(lead.warranty_battery_kwh ?? defaultPkg?.battery_kwh ?? "") : ""),
          serial: parsed[i]?.serial ?? "",
        }));
      }
    } catch {}
    // Backfill from legacy single-battery fields if JSON missing
    const seed: Batt = {
      brand: lead.warranty_battery_brand ?? defaultPkg?.battery_brand ?? "",
      kwh: String(lead.warranty_battery_kwh ?? defaultPkg?.battery_kwh ?? ""),
      serial: "",
    };
    return Array.from({ length: BATTERY_ROWS }, (_, i) => i === 0 ? seed : { ...emptyBatt });
  })();
  const [batteries, setBatteries] = useState<Batt[]>(initBatteries);
  const updateBatt = (i: number, patch: Partial<Batt>) => {
    setBatteries(prev => prev.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  };
  const [snScanning, setSnScanning] = useState(false);
  const [battSnScanning, setBattSnScanning] = useState<number | null>(null);
  const handleBattSnPhoto = async (i: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    setBattSnScanning(i);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("lead_id", String(lead.id));
      fd.append("type", `warranty_batt${i}_scan`);
      const up = await apiFetch("/api/upload", { method: "POST", body: fd });
      if (!up.url) return;
      const ocr = await apiFetch("/api/ocr-serial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl: up.url }) });
      if (ocr?.serial) updateBatt(i, { serial: ocr.serial });
      fetch(`/api/upload?file=${encodeURIComponent(up.url)}`, { method: "DELETE", headers: { ...getUserIdHeader() } }).catch(() => {});
    } finally { setBattSnScanning(null); }
  };

  const handleSnPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    setSnScanning(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("lead_id", String(lead.id));
      fd.append("type", "warranty_sn_scan");
      const up = await apiFetch("/api/upload", { method: "POST", body: fd });
      if (!up.url) return;
      const ocr = await apiFetch("/api/ocr-serial", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: up.url }),
      });
      if (ocr?.serial) setSn(ocr.serial);
      // Clean up tmp file (we only needed the text)
      fetch(`/api/upload?file=${encodeURIComponent(up.url)}`, { method: "DELETE", headers: { ...getUserIdHeader() } }).catch(() => {});
    } finally { setSnScanning(false); }
  };
  const scrollToStep = () => {
    setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  };
  // Single signature per lead — stored in install_customer_signature_url (signed once
  // at Install handover; if blank when reaching Warranty, SignaturePad saves there too).
  const effectiveSignatureUrl = lead.install_customer_signature_url;

  const uploadCert = async (file: File, type: string): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("lead_id", String(lead.id));
    fd.append("type", `warranty_${type}`);
    const res = await apiFetch("/api/upload", { method: "POST", body: fd });
    return res.url || null;
  };

  const handleInverterCert = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    setUploadingField("inverter");
    try {
      const url = await uploadCert(f, "inverter_cert");
      if (url) {
        setInverterCertUrl(url);
        await apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ warranty_inverter_cert_url: url }) });
      }
    } finally { setUploadingField(null); }
  };
  const handlePanelCert = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    setUploadingField("panel");
    try {
      const url = await uploadCert(f, "panel_cert");
      if (url) {
        setPanelCertUrl(url);
        await apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ warranty_panel_cert_url: url }) });
      }
    } finally { setUploadingField(null); }
  };
  const handlePanelSerials = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    setUploadingField("serials");
    try {
      const url = await uploadCert(f, "panel_serials");
      if (url) {
        setPanelSerialsUrl(url);
        await apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ warranty_panel_serials_url: url }) });
      }
    } finally { setUploadingField(null); }
  };
  const handleOtherDocs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); e.target.value = ""; if (!files.length) return;
    setUploadingField("other");
    try {
      const uploaded: string[] = [];
      for (const f of files) {
        const url = await uploadCert(f, "other");
        if (url) uploaded.push(url);
      }
      const next = [...otherDocs, ...uploaded];
      setOtherDocs(next);
      await apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ warranty_other_docs_url: next.length ? next.join(",") : null }) });
    } finally { setUploadingField(null); }
  };
  const removeCert = async (field: "inverter" | "panel" | "serials") => {
    const urlMap = { inverter: inverterCertUrl, panel: panelCertUrl, serials: panelSerialsUrl };
    const setterMap = { inverter: setInverterCertUrl, panel: setPanelCertUrl, serials: setPanelSerialsUrl };
    const colMap = { inverter: "warranty_inverter_cert_url", panel: "warranty_panel_cert_url", serials: "warranty_panel_serials_url" };
    const url = urlMap[field];
    if (!url) return;
    fetch(`/api/upload?file=${encodeURIComponent(url)}`, { method: "DELETE", headers: { ...getUserIdHeader() } }).catch(() => {});
    setterMap[field](null);
    await apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [colMap[field]]: null }) });
  };
  const removeOtherDoc = async (url: string) => {
    fetch(`/api/upload?file=${encodeURIComponent(url)}`, { method: "DELETE", headers: { ...getUserIdHeader() } }).catch(() => {});
    const next = otherDocs.filter(u => u !== url);
    setOtherDocs(next);
    await apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ warranty_other_docs_url: next.length ? next.join(",") : null }) });
  };

  const endDate = addYears(startDate, 2);
  // Use the package confirmed at Survey (lead.interested_package_id is overwritten
  // by the survey team's final pick). Pre-survey deposit pick (pre_package_id) may
  // differ if the team upgraded/downgraded after the site visit.
  const pkg = packages.find(p => p.id === lead.interested_package_id);
  const hasBattery = !!pkg?.has_battery;

  // Auto-save SN / doc no / start date / equipment snapshot
  useEffect(() => {
    if (state !== "active") return;
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warranty_inverter_sn: sn || null,
          warranty_doc_no: docNo || null,
          warranty_start_date: startDate || null,
          warranty_end_date: endDate,
          warranty_system_size_kwp: sysKwp === "" ? null : sysKwp,
          warranty_panel_count: panelCount === "" ? null : panelCount,
          warranty_panel_watt: panelWatt === "" ? null : panelWatt,
          warranty_panel_brand: panelBrand || null,
          warranty_inverter_brand: invBrand || null,
          warranty_inverter_kw: invKw === "" ? null : invKw,
          warranty_batteries: JSON.stringify(batteries.filter(b => b.brand || b.kwh || b.serial).map(b => ({ brand: b.brand || null, kwh: b.kwh ? parseFloat(b.kwh) : null, serial: b.serial || null }))),
          warranty_has_battery: batteries.some(b => b.brand || b.kwh || b.serial),
        }),
      }).catch(console.error);
    }, 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sn, docNo, startDate, sysKwp, panelCount, panelWatt, panelBrand, invBrand, invKw, batteries]);

  const saveDraft = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warranty_inverter_sn: sn || null,
          warranty_doc_no: docNo || null,
          warranty_start_date: startDate || null,
          warranty_end_date: endDate,
        }),
      });
      await refresh();
    } finally { setSaving(false); }
  };

  const issueWarranty = async () => {
    const missing: string[] = [];
    if (!sn) missing.push("Inverter Serial Number");
    if (!docNo) missing.push("เลขที่เอกสาร");
    if (!startDate) missing.push("วันเริ่มประกัน");
    if (!effectiveSignatureUrl) missing.push("ลายเซ็นลูกค้า");
    if (missing.length > 0) { setNextError(missing.join(", ")); return; }

    setIssuing(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warranty_inverter_sn: sn,
          warranty_doc_no: docNo,
          warranty_start_date: startDate,
          warranty_end_date: endDate,
          warranty_doc_url: `/api/warranty/${lead.id}`,
          warranty_issued_at: true,
          warranty_issued_by: me?.id ?? null,
          status: "gridtie",
        }),
      });
      await refresh();
    } finally { setIssuing(false); }
  };

  const renderDoneContent = () => (
    <>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Info label="เลขที่เอกสาร" value={lead.warranty_doc_no} />
        <Info label="Inverter SN" value={lead.warranty_inverter_sn} mono />
        <Info label="เริ่มประกัน" value={formatDate(lead.warranty_start_date)} />
        <Info label="สิ้นสุด" value={formatDate(lead.warranty_end_date)} />
      </div>
      {lead.warranty_doc_url && (
        <button
          type="button"
          onClick={openWarranty}
          className="flex items-center justify-center gap-2 w-full h-11 rounded-lg bg-primary hover:bg-primary-dark text-sm font-semibold text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          ใบรับประกัน
        </button>
      )}
    </>
  );


  return (
    <>
    {/* Modal lives outside StepLayout so it stays mounted when the step
        switches between active + done states (done uses renderDone and
        skips the children tree where the modal used to live). */}
    {previewOpen && (
      <WarrantyModal leadId={lead.id} docNo={docNo || lead.warranty_doc_no || ""} onClose={() => setPreviewOpen(false)} />
    )}
    <StepLayout
      state={state}
      expanded={expanded}
      onToggle={onToggle}
      doneHeader={
        <>
          <span className="text-sm font-semibold text-emerald-700 flex-1">ออกใบรับประกัน · {lead.warranty_doc_no}</span>
          {lead.warranty_doc_url && (
            <button
              type="button"
              onClick={openWarranty}
              className="mr-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dark shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              ใบรับประกัน
            </button>
          )}
        </>
      }
      renderDone={renderDoneContent}
      subSteps={SUB_STEPS}
      subStep={subStep}
      onSubStepChange={(i) => { setSubStep(i); scrollToStep(); }}
    >
    <div className="space-y-3">
      {/* subStep 0: ข้อมูล */}
      {subStep === 0 && (<>
        <div>
          <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">เลขที่เอกสาร</label>
          <input value={docNo} onChange={e => setDocNo(e.target.value)} placeholder="SSE250045"
            className="w-full h-11 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-primary" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">เริ่มประกัน (พ.ศ.)</label>
            <ThaiDateInput value={startDate} onChange={setStartDate} />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">สิ้นสุด (+2 ปี)</label>
            <input value={endDate ? isoToBE(endDate) : ""} readOnly
              className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 font-mono tabular-nums" />
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">อุปกรณ์ที่ติดตั้ง (ตามหน้างานจริง)</div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">ขนาดระบบ (kWp)</label>
            <input type="number" step="0.01" value={sysKwp} onChange={e => setSysKwp(e.target.value ? parseFloat(e.target.value) : "")} placeholder="5.00" className="w-full h-10 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-primary" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">จำนวนแผง</label>
              <input type="number" value={panelCount} onChange={e => setPanelCount(e.target.value ? parseInt(e.target.value) : "")} placeholder="10" className="w-full h-10 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">วัตต์/แผง</label>
              <input type="number" value={panelWatt} onChange={e => setPanelWatt(e.target.value ? parseInt(e.target.value) : "")} placeholder="550" className="w-full h-10 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ยี่ห้อแผง</label>
              <input type="text" value={panelBrand} onChange={e => setPanelBrand(e.target.value)} placeholder="Canadian" className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:border-primary" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">ยี่ห้ออินเวอร์เตอร์</label>
              <input type="text" value={invBrand} onChange={e => setInvBrand(e.target.value)} placeholder="Huawei" className="w-full h-10 px-3 rounded-lg border border-gray-200 focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ขนาด (kW)</label>
              <input type="number" step="0.01" value={invKw} onChange={e => setInvKw(e.target.value ? parseFloat(e.target.value) : "")} placeholder="5" className="w-full h-10 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-primary" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Inverter Serial Number</label>
            <div className="flex gap-2">
              <input value={sn} onChange={e => setSn(e.target.value)} placeholder="HW1234567890" className="flex-1 h-10 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-primary" />
              <input type="file" accept="image/*" capture="environment" onChange={handleSnPhoto} className="hidden" id={`sn-scan-${lead.id}`} />
              <label htmlFor={`sn-scan-${lead.id}`} className="shrink-0 self-stretch w-10 rounded-lg border border-gray-200 bg-white flex items-center justify-center cursor-pointer hover:border-primary hover:text-primary text-gray-500 transition-colors" title="ถ่ายรูป SN เพื่ออ่านอัตโนมัติ">
                {snScanning ? (
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                )}
              </label>
            </div>
            <div className="text-[11px] text-gray-400 mt-1">ถ่ายรูปฉลากอินเวอร์เตอร์ — ระบบจะอ่าน SN ให้อัตโนมัติ</div>
          </div>
        </div>
      </>)}

      {/* subStep 1: แบตเตอรี่ */}
      {subStep === 1 && (
        <div className="rounded-lg border border-gray-200 p-3 space-y-2">
          <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">แบตเตอรี่ (ไม่บังคับ · สูงสุด {BATTERY_ROWS} ก้อน)</div>
          <div className="grid grid-cols-[24px_1fr_72px_1fr_40px] gap-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1">
            <span></span>
            <span>ยี่ห้อ</span>
            <span>kWh</span>
            <span>Serial</span>
            <span></span>
          </div>
          {batteries.map((b, i) => (
            <div key={i} className="grid grid-cols-[24px_1fr_72px_1fr_40px] gap-1.5 items-center">
              <span className="text-xs text-gray-400 text-center">{i + 1}</span>
              <input type="text" value={b.brand} onChange={e => updateBatt(i, { brand: e.target.value })} placeholder="Huawei LUNA" className="h-9 px-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary" />
              <input type="number" step="0.01" value={b.kwh} onChange={e => updateBatt(i, { kwh: e.target.value })} placeholder="5" className="h-9 px-2 rounded-lg border border-gray-200 bg-white text-sm font-mono focus:outline-none focus:border-primary" />
              <input type="text" value={b.serial} onChange={e => updateBatt(i, { serial: e.target.value })} placeholder="SN…" className="h-9 px-2 rounded-lg border border-gray-200 bg-white text-sm font-mono focus:outline-none focus:border-primary" />
              <>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => handleBattSnPhoto(i, e)} className="hidden" id={`batt-sn-${i}-${lead.id}`} />
                <label htmlFor={`batt-sn-${i}-${lead.id}`} className="h-9 w-9 rounded-lg border border-gray-200 bg-white flex items-center justify-center cursor-pointer hover:border-primary hover:text-primary text-gray-500 transition-colors" title="ถ่ายรูป SN">
                  {battSnScanning === i ? (
                    <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  )}
                </label>
              </>
            </div>
          ))}
        </div>
      )}

      {/* subStep 2: เอกสาร */}
      {subStep === 2 && (<>
        <div className="space-y-2">
          <CertSlot label="ใบรับประกันอินเวอร์เตอร์ (ผู้ผลิต)" url={inverterCertUrl} uploading={uploadingField === "inverter"} inputId={`inv-cert-${lead.id}`} onChange={handleInverterCert} onRemove={() => removeCert("inverter")} />
          <CertSlot label="ใบรับประกันแผงโซลาร์ (ผู้ผลิต)" url={panelCertUrl} uploading={uploadingField === "panel"} inputId={`pnl-cert-${lead.id}`} onChange={handlePanelCert} onRemove={() => removeCert("panel")} />
          <CertSlot label="เอกสาร Serial แผงทั้งหมด" url={panelSerialsUrl} uploading={uploadingField === "serials"} inputId={`pnl-sn-${lead.id}`} onChange={handlePanelSerials} onRemove={() => removeCert("serials")} />
        </div>
        <div>
          <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">เอกสารแนบอื่นๆ</label>
          {otherDocs.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {otherDocs.map(url => {
                const name = url.split("/").pop() || "ไฟล์";
                return (
                  <div key={url} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                    <a href={url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-sm text-gray-700 hover:text-primary">{name}</a>
                    <button type="button" onClick={() => removeOtherDoc(url)} className="text-red-500 hover:text-red-600 text-xs font-semibold" style={{ minHeight: 0 }}>ลบ</button>
                  </div>
                );
              })}
            </div>
          )}
          <input type="file" multiple onChange={handleOtherDocs} className="hidden" id={`other-docs-${lead.id}`} />
          <label htmlFor={`other-docs-${lead.id}`} className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 hover:border-primary cursor-pointer transition-colors">
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <span className="text-sm text-gray-500">{uploadingField === "other" ? "กำลังอัปโหลด..." : "เพิ่มเอกสารแนบ"}</span>
          </label>
        </div>
      </>)}

      {/* subStep 3: ลายเซ็น — if already signed at Install, just show it and allow
         Next. If not, SignaturePad lets the customer sign now. */}
      {subStep === 3 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">ลายเซ็นลูกค้า (ยืนยันรับงาน)</div>
          {effectiveSignatureUrl ? (
            <div className="bg-white rounded-lg border border-gray-200 p-3 flex items-center justify-center">
              <FallbackImage src={effectiveSignatureUrl} alt="ลายเซ็น" className="max-h-40 object-contain" />
            </div>
          ) : (
            <SignaturePad
              leadId={lead.id}
              fieldName="install_customer_signature_url"
              initialUrl={null}
              onSaved={() => { refresh(); }}
            />
          )}
        </div>
      )}

      {/* subStep 4: ยืนยัน */}
      {subStep === 4 && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setPreviewOpen(true)}
              className="h-11 rounded-lg text-sm font-semibold border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors flex items-center justify-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              ดูตัวอย่าง
            </button>
            <button
              type="button"
              disabled={lineSending || !lead.line_id}
              onClick={() => setLineConfirm(true)}
              className={`h-11 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-1.5 ${
                lineSent ? "bg-emerald-500 text-white" : !lead.line_id ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "text-white bg-[#06C755] hover:brightness-110 shadow-[#06C755]/20"
              }`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.064-.022.134-.032.2-.032.211 0 .391.09.51.25l2.44 3.317V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" /></svg>
              {lineSending ? "กำลังส่ง..." : lineSent ? "✓ ส่งแล้ว" : !lead.line_id ? "ไม่มี LINE" : "ส่ง LINE"}
            </button>
          </div>
          <button type="button" onClick={issueWarranty} disabled={issuing || !effectiveSignatureUrl}
            className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1">
            {issuing ? "กำลังออกเอกสาร..." : "ออกเอกสาร & ถัดไป"}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>

          {lineConfirm && (
            <LineConfirmModal
              name={lead.full_name}
              description="ส่งใบรับประกันทาง LINE"
              onCancel={() => setLineConfirm(false)}
              onConfirm={async () => {
                setLineConfirm(false);
                setLineSending(true);
                try {
                  const origin = typeof window !== "undefined" ? window.location.origin : "";
                  const pdfUrl = `${origin}/api/warranty/${lead.id}`;
                  const periodLabel = startDate && endDate ? `${formatDate(startDate)} — ${formatDate(endDate)}` : "2 ปี";
                  const messages = [buildWarrantyFlex({
                    origin,
                    docNo: docNo || `SSE${new Date().getFullYear().toString().slice(-2)}${String(lead.id).padStart(4, "0")}`,
                    name: lead.full_name,
                    pdfUrl,
                    periodLabel,
                  })];
                  await apiFetch("/api/line/send", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ lead_id: lead.id, messages }),
                  });
                  setLineSent(true);
                } catch {
                  setLineSent(false);
                } finally { setLineSending(false); }
              }}
            />
          )}
        </div>
      )}

      {/* Navigation */}
      {subStep < 4 && (
        <div className="flex gap-2 mt-3">
          {subStep > 0 && (
            <button type="button" onClick={() => { setSubStep(subStep - 1); scrollToStep(); }} className="flex-1 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              ย้อนกลับ
            </button>
          )}
          <button type="button" onClick={() => { setSubStep(subStep + 1); scrollToStep(); }} className="flex-1 h-11 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 transition-colors flex items-center justify-center gap-1">
            ถัดไป
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
          </button>
        </div>
      )}
      {subStep === 4 && (
        <button type="button" onClick={() => { setSubStep(subStep - 1); scrollToStep(); }} className="w-full h-9 mt-2 rounded-lg text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          ย้อนกลับ
        </button>
      )}

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
    </div>
    </StepLayout>
    </>
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

function CertSlot({ label, url, uploading, inputId, onChange, onRemove }: { label: string; url: string | null; uploading: boolean; inputId: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; onRemove: () => void }) {
  return (
    <div>
      <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">{label}</label>
      {url ? (
        <div className="relative">
          <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
            <svg className="w-6 h-6 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M14,2H6C4.9,2 4,2.9 4,4V20C4,21.1 4.9,22 6,22H18C19.1,22 20,21.1 20,20V8L14,2M18,20H6V4H13V9H18V20Z" /></svg>
            <span className="text-sm text-gray-700 flex-1 truncate">{url.split("/").pop()}</span>
          </a>
          <button type="button" onClick={onRemove} className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full text-white flex items-center justify-center text-xs" style={{ minHeight: 0 }}>✕</button>
        </div>
      ) : (
        <label htmlFor={inputId} className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 hover:border-primary cursor-pointer transition-colors">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          <span className="text-sm text-gray-500">{uploading ? "กำลังอัปโหลด..." : "อัปโหลด"}</span>
          <input type="file" onChange={onChange} className="hidden" id={inputId} />
        </label>
      )}
    </div>
  );
}
