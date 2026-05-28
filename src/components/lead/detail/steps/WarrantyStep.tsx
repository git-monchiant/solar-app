"use client";
import { CameraIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, DocumentIcon, LineIcon } from "@/components/ui/icons";

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
import { compressImage } from "@/lib/utils/compressImage";
import { formatThaiDate } from "@/lib/utils/formatters";
import { INVERTER_BRANDS, INVERTER_KW_SIZES, PHASE_LABEL } from "@/lib/constants/survey-options";

const SUB_STEPS = ["ข้อมูล", "แบตเตอรี่", "แผง", "เอกสาร", "ยืนยัน"];
const PANEL_ROWS = 20;

const formatDate = (d: string | null) => formatThaiDate(d, { buddhist: true });

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
  const [issuing, setIssuing] = useState(false);
  const [inverterCertUrl, setInverterCertUrl] = useState<string | null>(lead.warranty_inverter_cert_url);
  const [panelCertUrl, setPanelCertUrl] = useState<string | null>(lead.warranty_panel_cert_url);
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
  const [panelCount, setPanelCount] = useState<number | "">(lead.warranty_panel_count ?? "");
  const [panelWatt, setPanelWatt] = useState<number | "">(lead.warranty_panel_watt ?? "");
  const [panelBrand, setPanelBrand] = useState<string>(lead.warranty_panel_brand ?? "");
  const [invBrand, setInvBrand] = useState<string>(lead.warranty_inverter_brand ?? defaultPkg?.inverter_brand ?? "");
  const [invKw, setInvKw] = useState<number | "">(lead.warranty_inverter_kw ?? defaultPkg?.inverter_kw ?? "");
  // Phase defaults to whatever survey captured — staff override only if the
  // actual install diverged. Stored separately from survey_electrical_phase
  // so the survey record stays intact.
  const [phase, setPhase] = useState<string>(lead.warranty_electrical_phase ?? lead.survey_electrical_phase ?? "");
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
  // Per-row verified lock for batteries — same pattern as panelVerified.
  // Stored in localStorage so it survives page refresh without a DB column.
  const battVerifiedKey = `warrantyBattVerified_${lead.id}`;
  const [battVerified, setBattVerified] = useState<boolean[]>(() => {
    if (typeof window === "undefined") return Array.from({ length: BATTERY_ROWS }, () => false);
    try {
      const raw = localStorage.getItem(battVerifiedKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        return Array.from({ length: BATTERY_ROWS }, (_, i) => !!parsed[i]);
      }
    } catch {}
    return Array.from({ length: BATTERY_ROWS }, () => false);
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(battVerifiedKey, JSON.stringify(battVerified)); } catch {}
  }, [battVerified, battVerifiedKey]);
  const toggleBattVerified = (i: number) => {
    setBattVerified(prev => prev.map((v, idx) => idx === i ? !v : v));
  };
  // Battery serial bulk-scan — auto-process pipeline mirroring panel scan.
  // Each uploaded photo is OCR'd individually, results stream into next empty
  // unlocked battery row's serial field (locked rows untouched, dedup against
  // every existing serial).
  const [battScanProgress, setBattScanProgress] = useState<{ current: number; total: number } | null>(null);
  const applyBattOcrSerials = (found: string[]) => {
    if (found.length === 0) return;
    setBatteries(prev => {
      const existing = new Set(prev.map(b => b.serial.trim()).filter(Boolean));
      const queue: string[] = [];
      for (const raw of found) {
        const s = raw.trim();
        if (!s || existing.has(s)) continue;
        queue.push(s);
        existing.add(s);
      }
      let qi = 0;
      return prev.map((b, idx) => {
        if (battVerified[idx] || b.serial.trim() || qi >= queue.length) return b;
        return { ...b, serial: queue[qi++] };
      });
    });
  };
  const handleBattScanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); e.target.value = "";
    if (!files.length || battScanProgress) return;
    // Fresh batch — wipe serials in unlocked rows (brand/kWh untouched).
    setBatteries(prev => prev.map((b, i) => battVerified[i] ? b : { ...b, serial: "" }));
    setBattScanProgress({ current: 0, total: files.length });
    try {
      for (let i = 0; i < files.length; i++) {
        setBattScanProgress({ current: i + 1, total: files.length });
        const f = files[i];
        let uploadedUrl: string | null = null;
        try {
          const compressed = await compressImage(f).catch(() => f);
          const fd = new FormData();
          fd.append("file", compressed);
          fd.append("lead_id", String(lead.id));
          fd.append("type", "warranty_batt_scan");
          const up = await apiFetch("/api/upload", { method: "POST", body: fd });
          if (!up.url) continue;
          uploadedUrl = up.url;
          const res = await apiFetch("/api/ocr-battery-serials", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrls: [uploadedUrl] }),
          });
          const found: string[] = Array.isArray(res?.serials) ? res.serials : [];
          applyBattOcrSerials(found);
        } finally {
          if (uploadedUrl) {
            fetch(`/api/upload?file=${encodeURIComponent(uploadedUrl)}`, { method: "DELETE", headers: { ...getUserIdHeader() } }).catch(() => {});
          }
        }
      }
    } finally {
      setBattScanProgress(null);
    }
  };
  // Panel serials — flat array of up to PANEL_ROWS strings (one per panel).
  // Persisted as JSON in warranty_panel_serials (NULL if all empty).
  const initPanelSerials: string[] = (() => {
    try {
      const parsed = lead.warranty_panel_serials ? JSON.parse(lead.warranty_panel_serials) : [];
      if (Array.isArray(parsed)) {
        return Array.from({ length: PANEL_ROWS }, (_, i) => typeof parsed[i] === "string" ? parsed[i] : "");
      }
    } catch {}
    return Array.from({ length: PANEL_ROWS }, () => "");
  })();
  const [panelSerials, setPanelSerials] = useState<string[]>(initPanelSerials);
  const updatePanelSerial = (i: number, val: string) => {
    setPanelSerials(prev => prev.map((s, idx) => idx === i ? val : s));
  };
  // "Verified" flags — per-slot lock. When true, AI rescan skips that slot.
  // Persisted to localStorage (per lead) so verification survives page refresh
  // without requiring a DB column.
  const verifiedKey = `warrantyPanelVerified_${lead.id}`;
  const [panelVerified, setPanelVerified] = useState<boolean[]>(() => {
    if (typeof window === "undefined") return Array.from({ length: PANEL_ROWS }, () => false);
    try {
      const raw = localStorage.getItem(verifiedKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        return Array.from({ length: PANEL_ROWS }, (_, i) => !!parsed[i]);
      }
    } catch {}
    return Array.from({ length: PANEL_ROWS }, () => false);
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(verifiedKey, JSON.stringify(panelVerified)); } catch {}
  }, [panelVerified, verifiedKey]);
  const togglePanelVerified = (i: number) => {
    setPanelVerified(prev => prev.map((v, idx) => idx === i ? !v : v));
  };
  // Panel serial bulk-scan — auto-process: each selected photo is uploaded,
  // OCR'd, and applied immediately, then the temp upload is deleted. If the
  // user picks multiple files at once, they're processed sequentially so the
  // user can see results stream in. Unlocked slots receive AI values in order;
  // locked (verified) slots are skipped.
  const [panelScanProgress, setPanelScanProgress] = useState<{ current: number; total: number } | null>(null);
  // Append AI serials into next empty unlocked slot — used within a single
  // upload batch so multiple photos accumulate rather than overwrite each
  // other. (Batch start clears unlocked slots first, so anything filled
  // mid-batch comes from an earlier photo in the same batch.)
  //
  // Dedup is strict: an incoming AI value is skipped if it matches ANY value
  // already in the list (locked or unlocked-filled) OR if it duplicates an
  // earlier value in the same `found` array. Prevents the same serial from
  // appearing twice anywhere in the UI.
  const applyOcrSerials = (found: string[]) => {
    if (found.length === 0) return;
    setPanelSerials(prev => {
      const existing = new Set(prev.map(s => s.trim()).filter(Boolean));
      const queue: string[] = [];
      for (const raw of found) {
        const s = raw.trim();
        if (!s || existing.has(s)) continue;
        queue.push(s);
        existing.add(s);
      }
      let qi = 0;
      return prev.map((s, idx) => {
        if (panelVerified[idx] || s.trim() || qi >= queue.length) return s;
        return queue[qi++];
      });
    });
  };
  const handlePanelScanUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); e.target.value = "";
    if (!files.length || panelScanProgress) return;
    // Fresh batch — wipe unlocked slots so new AI results have a clean canvas.
    // Locked (verified) slots survive untouched.
    setPanelSerials(prev => prev.map((s, i) => panelVerified[i] ? s : ""));
    setPanelScanProgress({ current: 0, total: files.length });
    try {
      for (let i = 0; i < files.length; i++) {
        setPanelScanProgress({ current: i + 1, total: files.length });
        const f = files[i];
        let uploadedUrl: string | null = null;
        try {
          const compressed = await compressImage(f).catch(() => f);
          const fd = new FormData();
          fd.append("file", compressed);
          fd.append("lead_id", String(lead.id));
          fd.append("type", "warranty_panel_scan");
          const up = await apiFetch("/api/upload", { method: "POST", body: fd });
          if (!up.url) continue;
          uploadedUrl = up.url;
          const res = await apiFetch("/api/ocr-panel-serials", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageUrls: [uploadedUrl] }),
          });
          const found: string[] = Array.isArray(res?.serials) ? res.serials : [];
          applyOcrSerials(found);
        } finally {
          if (uploadedUrl) {
            fetch(`/api/upload?file=${encodeURIComponent(uploadedUrl)}`, { method: "DELETE", headers: { ...getUserIdHeader() } }).catch(() => {});
          }
        }
      }
    } finally {
      setPanelScanProgress(null);
    }
  };
  const [snScanning, setSnScanning] = useState(false);

  const handleSnPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    setSnScanning(true);
    try {
      const compressed = await compressImage(file).catch(() => file);
      const fd = new FormData();
      fd.append("file", compressed);
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
    // compressImage rejects non-image files (PDFs etc) — fall through with the
    // original file so PDF certificates still upload as-is.
    const prepared = await compressImage(file).catch(() => file);
    const fd = new FormData();
    fd.append("file", prepared);
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
  const removeCert = async (field: "inverter" | "panel") => {
    const urlMap = { inverter: inverterCertUrl, panel: panelCertUrl };
    const setterMap = { inverter: setInverterCertUrl, panel: setPanelCertUrl };
    const colMap = { inverter: "warranty_inverter_cert_url", panel: "warranty_panel_cert_url" };
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
          warranty_electrical_phase: phase || null,
          warranty_batteries: JSON.stringify(batteries.filter(b => b.brand || b.kwh || b.serial).map(b => ({ brand: b.brand || null, kwh: b.kwh ? parseFloat(b.kwh) : null, serial: b.serial || null }))),
          warranty_has_battery: batteries.some(b => b.brand || b.kwh || b.serial),
          warranty_panel_serials: panelSerials.some(s => s.trim()) ? JSON.stringify(panelSerials.map(s => s.trim())) : null,
        }),
      }).catch(console.error);
    }, 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sn, docNo, startDate, sysKwp, panelCount, panelWatt, panelBrand, invBrand, invKw, phase, batteries, panelSerials]);

  const issueWarranty = async () => {
    const missing: string[] = [];
    if (!sn) missing.push("Inverter Serial Number");
    if (!docNo) missing.push("เลขที่เอกสาร");
    if (!startDate) missing.push("วันเริ่มประกัน");
    if (!phase) missing.push("Phase ของระบบไฟ");
    if (!effectiveSignatureUrl) missing.push("ลายเซ็นลูกค้า");
    // Gate on me?.id — without a logged-in user we can't stamp warranty_issued_by,
    // and submitting would null it out via the PATCH route's "set if defined"
    // logic. The button below also disables on !me?.id as a second line of
    // defense.
    if (!me?.id) missing.push("กรุณารอโหลดข้อมูลผู้ใช้ก่อน");
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
          warranty_issued_by: me!.id,
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
              <DocumentIcon className="w-4 h-4" strokeWidth={2} />
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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <div className="col-span-2 md:col-span-1">
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">เลขที่เอกสาร</label>
            <input value={docNo} onChange={e => setDocNo(e.target.value)} placeholder="SSE250045"
              className="w-full h-11 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">รับประกันงานติดตั้ง</label>
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
            <input type="number" step="0.01" value={sysKwp} onChange={e => setSysKwp(e.target.value ? parseFloat(e.target.value) : "")} placeholder="5.00" className="w-full h-11 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-primary" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">จำนวนแผง</label>
              <input type="number" value={panelCount} onChange={e => setPanelCount(e.target.value ? parseInt(e.target.value) : "")} placeholder="10" className="w-full h-11 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">วัตต์/แผง</label>
              <input type="number" value={panelWatt} onChange={e => setPanelWatt(e.target.value ? parseInt(e.target.value) : "")} placeholder="550" className="w-full h-11 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ยี่ห้อแผง</label>
              <input type="text" value={panelBrand} onChange={e => setPanelBrand(e.target.value)} placeholder="Canadian" className="w-full h-11 px-3 rounded-lg border border-gray-200 focus:outline-none focus:border-primary" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">ยี่ห้ออินเวอร์เตอร์</label>
              <select value={invBrand} onChange={e => setInvBrand(e.target.value)} className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-primary">
                <option value="">เลือกยี่ห้อ</option>
                {INVERTER_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                {invBrand && !INVERTER_BRANDS.includes(invBrand as typeof INVERTER_BRANDS[number]) && (
                  <option value={invBrand}>{invBrand}</option>
                )}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ขนาด (kW)</label>
              <select value={invKw} onChange={e => setInvKw(e.target.value ? parseFloat(e.target.value) : "")} className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-white font-mono focus:outline-none focus:border-primary">
                <option value="">เลือกขนาด</option>
                {INVERTER_KW_SIZES.map(kw => <option key={kw} value={kw}>{kw} kW</option>)}
                {invKw !== "" && !INVERTER_KW_SIZES.includes(invKw as typeof INVERTER_KW_SIZES[number]) && (
                  <option value={invKw}>{invKw} kW</option>
                )}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Phase <span className="text-red-500">*</span></label>
              <select value={phase} onChange={e => setPhase(e.target.value)} className="w-full h-11 px-3 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-primary">
                <option value="">เลือก phase</option>
                {Object.entries(PHASE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Inverter Serial Number</label>
            <div className="flex gap-2">
              <input value={sn} onChange={e => setSn(e.target.value)} placeholder="HW1234567890" className="flex-1 h-11 px-3 rounded-lg border border-gray-200 font-mono focus:outline-none focus:border-primary" />
              <input type="file" accept="image/*" capture="environment" onChange={handleSnPhoto} className="hidden" id={`sn-scan-${lead.id}`} />
              <label htmlFor={`sn-scan-${lead.id}`} className="shrink-0 h-11 w-16 rounded-lg border border-active/30 bg-active-light text-active flex items-center justify-center cursor-pointer hover:bg-active/15 transition-colors" title="ถ่ายรูป SN เพื่ออ่านอัตโนมัติ">
                {snScanning ? (
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
                ) : (
                  <CameraIcon className="w-7 h-7" strokeWidth={2} />
                )}
              </label>
            </div>
            <div className="text-xxs text-gray-400 mt-1">ถ่ายรูปฉลากอินเวอร์เตอร์ — ระบบจะอ่าน SN ให้อัตโนมัติ</div>
          </div>
        </div>
      </>)}

      {/* subStep 1: แบตเตอรี่ */}
      {subStep === 1 && (
        <div className="space-y-2">
          {/* Auto-scan zone — same pattern as panel: each photo uploads + OCRs +
              applies immediately. Fills the serial field of next empty unlocked
              row; brand/kWh stay manual. */}
          <div className="rounded-lg border border-active/20 bg-active-light/50 p-3 space-y-2">
            <div className="text-xs font-semibold tracking-wider uppercase text-active">AI หา Serial แบตเตอรี่</div>
            <input type="file" accept="image/*" multiple onChange={handleBattScanUpload} className="hidden" id={`batt-scan-${lead.id}`} />
            <label
              htmlFor={`batt-scan-${lead.id}`}
              className={`w-full h-11 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                battScanProgress
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed pointer-events-none"
                  : "text-white bg-active hover:brightness-110 cursor-pointer"
              }`}
            >
              {battScanProgress ? (
                <>
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-active rounded-full animate-spin" />
                  ประมวลผล {battScanProgress.current}/{battScanProgress.total}
                </>
              ) : (
                <>
                  <CameraIcon className="w-5 h-5" strokeWidth={2} />
                  ถ่าย / เลือกรูป
                </>
              )}
            </label>
            <div className="text-xxs text-gray-500">ถ่ายรูป serial แบตทีละใบ AI จะอ่านแล้วเติมลง row unlocked อัตโนมัติ (brand/kWh กรอกเอง)</div>
          </div>

          {/* Battery rows */}
          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">แบตเตอรี่ (สูงสุด {BATTERY_ROWS} ก้อน)</div>
              <div className="flex items-center gap-2">
                <span className="text-xxs text-gray-500">ยืนยัน {battVerified.filter(Boolean).length}/{BATTERY_ROWS}</span>
                <button
                  type="button"
                  onClick={() => setBatteries(prev => prev.map((b, i) => battVerified[i] ? b : { ...b, serial: "" }))}
                  disabled={!batteries.some((b, i) => b.serial.trim() && !battVerified[i])}
                  className="text-xxs font-semibold text-red-500 hover:text-red-600 disabled:text-gray-300 disabled:cursor-not-allowed"
                  style={{ minHeight: 0 }}
                  title="ล้าง serial ในแถวที่ยังไม่ยืนยัน (brand/kWh ไม่ถูกล้าง, ก้อนที่ lock ✓ ไม่ถูกล้าง)"
                >
                  ล้าง serial ที่ยังไม่ยืนยัน
                </button>
              </div>
            </div>
            {/* Desktop column headers (hidden on mobile — mobile uses card layout) */}
            <div className="hidden md:grid grid-cols-[1fr_72px_1fr_36px] gap-1.5 text-xxs font-semibold text-gray-400 uppercase tracking-wider px-1">
              <span>ยี่ห้อ</span>
              <span>kWh</span>
              <span>Serial</span>
              <span></span>
            </div>
            {batteries.map((b, i) => {
              const filled = !!(b.brand || b.kwh || b.serial);
              const verified = battVerified[i];
              return (
                <div
                  key={i}
                  className={`
                    rounded-xl border p-2.5 space-y-1.5 transition-colors
                    ${verified ? "border-emerald-300 bg-emerald-50/30" : filled ? "border-gray-200 bg-white" : "border-dashed border-gray-200 bg-gray-50/40"}
                    md:p-0 md:rounded-none md:border-0 md:bg-transparent md:space-y-0
                    md:grid md:grid-cols-[1fr_72px_1fr_36px] md:gap-1.5 md:items-center
                  `}
                >
                  {/* Row 1 (mobile) / cols 1-2 (desktop): brand + kWh */}
                  <div className="flex items-center gap-1.5 md:contents">
                    <input type="text" value={b.brand} onChange={e => updateBatt(i, { brand: e.target.value })} placeholder={`ก้อนที่ ${i + 1}`} className="flex-1 min-w-0 h-9 px-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary md:flex-none md:w-auto md:min-w-0" />
                    <input type="number" step="0.01" value={b.kwh} onChange={e => updateBatt(i, { kwh: e.target.value })} placeholder="5" className="w-16 shrink-0 h-9 px-2 rounded-lg border border-gray-200 bg-white text-sm font-mono text-center focus:outline-none focus:border-primary md:w-auto md:text-left" />
                  </div>
                  {/* Row 2 (mobile) / cols 3-4 (desktop): serial + lock checkbox */}
                  <div className="flex items-center gap-1.5 md:contents">
                    <input type="text" value={b.serial} onChange={e => updateBatt(i, { serial: e.target.value })} placeholder="SN…" className="flex-1 min-w-0 h-9 px-2 rounded-lg border border-gray-200 bg-white text-sm font-mono focus:outline-none focus:border-primary md:flex-none md:w-auto md:min-w-0" />
                    <button
                      type="button"
                      onClick={() => toggleBattVerified(i)}
                      className={`shrink-0 h-9 w-9 rounded-lg border flex items-center justify-center transition-colors ${
                        verified
                          ? "border-emerald-400 bg-emerald-500 text-white hover:bg-emerald-600"
                          : "border-gray-200 bg-white text-gray-300 hover:text-gray-500 hover:border-gray-300"
                      }`}
                      title={verified ? "ยกเลิกยืนยัน (AI จะ scan ทับได้)" : "ยืนยันถูกแล้ว (lock — AI จะไม่ทับ)"}
                      aria-pressed={verified}
                    >
                      <CheckIcon className="w-4 h-4" strokeWidth={3} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* subStep 2: แผง — text list of per-panel serial numbers (max PANEL_ROWS).
         Optional AI bulk-scan zone at top: upload one or more photos (each may
         contain many panel labels), Gemini extracts all serials in one call and
         fills into empty slots below. */}
      {subStep === 2 && (
        <div className="space-y-2">
          {/* Auto-scan zone — each photo uploads + OCRs + applies immediately,
              then the temp upload is deleted. Workflow: take photo → AI fills
              unlocked slots → user verifies & ticks ✓ to lock → take next photo. */}
          <div className="rounded-lg border border-active/20 bg-active-light/50 p-3 space-y-2">
            <div className="text-xs font-semibold tracking-wider uppercase text-active">AI หา Serial แผง</div>
            <input type="file" accept="image/*" multiple onChange={handlePanelScanUpload} className="hidden" id={`panel-scan-${lead.id}`} />
            <label
              htmlFor={`panel-scan-${lead.id}`}
              className={`w-full h-11 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap ${
                panelScanProgress
                  ? "bg-gray-200 text-gray-500 cursor-not-allowed pointer-events-none"
                  : "text-white bg-active hover:brightness-110 cursor-pointer"
              }`}
            >
              {panelScanProgress ? (
                <>
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-active rounded-full animate-spin" />
                  ประมวลผล {panelScanProgress.current}/{panelScanProgress.total}
                </>
              ) : (
                <>
                  <CameraIcon className="w-5 h-5" strokeWidth={2} />
                  ถ่าย / เลือกรูป
                </>
              )}
            </label>
            <div className="text-xxs text-gray-500">ถ่ายรูปทีละใบ AI จะอ่านแล้วเติมลงช่อง unlocked อัตโนมัติ — เลือกหลายรูปครั้งเดียวก็ได้ (จะประมวลทีละใบ)</div>
          </div>

          {/* Manual serial list — checkbox locks a slot so AI rescan won't overwrite */}
          <div className="rounded-lg border border-gray-200 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">Serial แผง (สูงสุด {PANEL_ROWS} แผง)</div>
              <div className="flex items-center gap-2">
                <span className="text-xxs text-gray-500">ยืนยัน {panelVerified.filter(Boolean).length}/{PANEL_ROWS}</span>
                <button
                  type="button"
                  onClick={() => setPanelSerials(prev => prev.map((s, i) => panelVerified[i] ? s : ""))}
                  disabled={!panelSerials.some((s, i) => s.trim() && !panelVerified[i])}
                  className="text-xxs font-semibold text-red-500 hover:text-red-600 disabled:text-gray-300 disabled:cursor-not-allowed"
                  style={{ minHeight: 0 }}
                  title="ล้าง serial ในช่องที่ยังไม่ยืนยัน (ช่องที่ lock ✓ ไม่ถูกล้าง)"
                >
                  ล้างที่ยังไม่ยืนยัน
                </button>
              </div>
            </div>
            {/* Column-major flow on desktop (col 1: 1-10, col 2: 11-20) so users
                can scan vertically and compare side-by-side with the physical
                panel stack. Mobile stays as a single column. */}
            <div className="grid grid-cols-1 md:grid-cols-2 md:grid-rows-[repeat(10,minmax(0,auto))] md:grid-flow-col gap-1.5">
              {panelSerials.map((s, i) => {
                const verified = panelVerified[i];
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-6 shrink-0 text-xs text-gray-400 text-right tabular-nums">{i + 1}.</span>
                    <input
                      type="text"
                      value={s}
                      onChange={e => updatePanelSerial(i, e.target.value)}
                      placeholder={`แผงที่ ${i + 1}`}
                      className={`flex-1 min-w-0 h-9 px-2 rounded-lg border bg-white text-sm font-mono focus:outline-none focus:border-primary transition-colors ${
                        verified ? "border-emerald-300 bg-emerald-50/30" : "border-gray-200"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => togglePanelVerified(i)}
                      className={`shrink-0 h-9 w-9 rounded-lg border flex items-center justify-center transition-colors ${
                        verified
                          ? "border-emerald-400 bg-emerald-500 text-white hover:bg-emerald-600"
                          : "border-gray-200 bg-white text-gray-300 hover:text-gray-500 hover:border-gray-300"
                      }`}
                      title={verified ? "ยกเลิกยืนยัน (AI จะ scan ทับได้)" : "ยืนยันถูกแล้ว (lock — AI จะไม่ทับ)"}
                      aria-pressed={verified}
                    >
                      <CheckIcon className="w-4 h-4" strokeWidth={3} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* subStep 3: เอกสาร */}
      {subStep === 3 && (<>
        <div className="space-y-2">
          <CertSlot label="ใบรับประกันอินเวอร์เตอร์ (ผู้ผลิต)" url={inverterCertUrl} uploading={uploadingField === "inverter"} inputId={`inv-cert-${lead.id}`} onChange={handleInverterCert} onRemove={() => removeCert("inverter")} />
          <CertSlot label="ใบรับประกันแผงโซลาร์ (ผู้ผลิต)" url={panelCertUrl} uploading={uploadingField === "panel"} inputId={`pnl-cert-${lead.id}`} onChange={handlePanelCert} onRemove={() => removeCert("panel")} />
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

      {/* subStep 4: ยืนยัน — signature + preview/LINE/issue actions in one panel.
         If customer signed at Install, the signature shows; otherwise SignaturePad
         lets them sign here. */}
      {subStep === 4 && (
        <div className="space-y-3">
          <div className="space-y-2">
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
              <LineIcon className="w-5 h-5" />
              {lineSending ? "กำลังส่ง..." : lineSent ? "✓ ส่งแล้ว" : !lead.line_id ? "ไม่มี LINE" : "ส่ง LINE"}
            </button>
          </div>
          <button type="button" onClick={issueWarranty} disabled={issuing || !effectiveSignatureUrl || !me?.id}
            className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:from-gray-300 disabled:to-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1">
            {issuing ? "กำลังออกเอกสาร..." : "ออกเอกสาร & ถัดไป"}
            <ChevronRightIcon className="w-4 h-4" strokeWidth={2} />
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
        </div>
      )}

      {/* Navigation */}
      {subStep < 4 && (
        <div className="flex gap-2 mt-3 md:justify-between">
          {subStep > 0 ? (
            <button type="button" onClick={() => { setSubStep(subStep - 1); scrollToStep(); }} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
              <ChevronLeftIcon className="w-4 h-4" strokeWidth={2} />
              ย้อนกลับ
            </button>
          ) : <span className="hidden md:block md:w-64" />}
          <button type="button" onClick={() => { setSubStep(subStep + 1); scrollToStep(); }} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 transition-colors flex items-center justify-center gap-1">
            ถัดไป
            <ChevronRightIcon className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      )}
      {subStep === 4 && (
        <div className="flex mt-3 md:justify-start">
          <button type="button" onClick={() => { setSubStep(subStep - 1); scrollToStep(); }} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
            <ChevronLeftIcon className="w-4 h-4" strokeWidth={2} />
            ย้อนกลับ
          </button>
        </div>
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
      <div className="text-xxs font-bold uppercase tracking-wider text-gray-400 mb-0.5">{label}</div>
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
