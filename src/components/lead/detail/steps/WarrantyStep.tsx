"use client";
import { BoltIcon, CameraIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, DocumentIcon, LineIcon, UserIcon } from "@/components/ui/icons";

import { useEffect, useRef, useState } from "react";
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
import { useFileViewer } from "@/lib/hooks/useFileViewer";
import { buildWarrantyFlex } from "@/lib/utils/line-flex";
import { compressImage } from "@/lib/utils/compressImage";
import { formatThaiDate } from "@/lib/utils/formatters";
import { INVERTER_BRANDS, INVERTER_KW_SIZES, PANEL_BRANDS, PHASE_LABEL } from "@/lib/constants/survey-options";
import Dropdown from "@/components/ui/Dropdown";
import NumberStepper from "@/components/ui/NumberStepper";
import SerialsUploader, { AddDeviceModal } from "@/components/lead/detail/SerialsUploader";

const SUB_STEPS = ["ข้อมูล", "แผง", "แบตเตอรี่", "เอกสาร", "ยืนยัน"];
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

function ThaiDateInput({ value, onChange, disabled }: { value: string; onChange: (iso: string) => void; disabled?: boolean }) {
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
      value={disabled ? "-" : text}
      onChange={e => handleChange(e.target.value)}
      placeholder="DD-MM-YYYY (พ.ศ.)"
      maxLength={10}
      disabled={disabled}
      className={`w-full h-8 px-3 rounded-lg border text-sm font-mono tabular-nums focus:outline-none ${disabled ? "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed" : invalid ? "border-red-400 focus:border-red-500" : "border-gray-200 focus:border-primary"}`}
    />
  );
}

// Warranty expiry = start + N years - 1 day. The -1 day so a 5-year warranty
// starting 2026-06-30 expires on 2031-06-29, not 2031-06-30 (the start date
// of the next year). User spec: warranty range is inclusive of both ends.
const addYears = (iso: string | null, years: number): string | null => {
  if (!iso) return null;
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  d.setFullYear(d.getFullYear() + years);
  d.setDate(d.getDate() - 1);
  return toISO(d);
};

interface Props extends StepCommonProps {
  packages: Package[];
  expanded?: boolean;
  onToggle?: () => void;
}

export default function WarrantyStep({ lead, state, refresh, packages, expanded, onToggle }: Props) {
  const { me } = useMe();
  const fileViewer = useFileViewer();
  const installedISO = lead.install_completed_at ? String(lead.install_completed_at).slice(0, 10) : null;
  const warrantyStartISO = lead.warranty_start_date ? String(lead.warranty_start_date).slice(0, 10) : null;
  const defaultStart = warrantyStartISO || installedISO || toISO(new Date());

  const [sn, setSn] = useState(lead.warranty_inverter_sn || "");
  // Camera button on the Serial Number row opens the shared add-device
  // wizard (same modal as the Equipment-Serial tab). After a successful save,
  // the new SN is mirrored back into this inline field. The actual wizard
  // handler (saveInverterFromWizard) is declared further down after the
  // brand/kw setters it needs are in scope.
  const [openInverterWizard, setOpenInverterWizard] = useState(false);
  // Warranty doc-no: stored value wins; otherwise mint via the shared
  // endpoint so the prefix + counter match the config (default "SSE-YYNNNN").
  const [docNo, setDocNo] = useState(lead.warranty_doc_no || "");
  useEffect(() => {
    if (docNo) return;
    apiFetch(`/api/leads/${lead.id}/doc-no/mint?type=warranty`, { method: "POST" })
      .then((r: { docNo: string }) => setDocNo(r.docNo))
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);
  const [startDate, setStartDate] = useState(defaultStart);
  // Warranty duration (years) drives the end-date calc — was hard-coded +2y.
  // O&M visits/year is metadata for the maintenance schedule on the cert.
  const [durationYears, setDurationYears] = useState<number>(lead.warranty_duration_years ?? 2);
  const [omPerYear,    setOmPerYear]    = useState<number>(lead.warranty_om_per_year ?? 2);
  const [issuing, setIssuing] = useState(false);
  const [inverterCertUrl, setInverterCertUrl] = useState<string | null>(lead.warranty_inverter_cert_url);
  const [panelCertUrl, setPanelCertUrl] = useState<string | null>(lead.warranty_panel_cert_url);
  const [otherDocs, setOtherDocs] = useState<string[]>(lead.warranty_other_docs_url ? lead.warranty_other_docs_url.split(",").filter(Boolean) : []);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  // Huawei warranty pull — only relevant when the inverter brand is Huawei.
  const [huaweiLoading, setHuaweiLoading] = useState(false);
  const [huaweiInfo, setHuaweiInfo] = useState<{ servicePackage: string; startDate: string; endDate: string } | null>(null);
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
  const [panelModel, setPanelModel] = useState<string>(lead.warranty_panel_model ?? "");
  // BATTERY summary on subStep 0 — mirrors Install §1.4. Independent from
  // subStep 2's per-row battery list (which has its own multi-row + OCR UI).
  const [battBrand, setBattBrand] = useState<string>(lead.warranty_battery_brand ?? "");
  const [battModel, setBattModel] = useState<string>(lead.warranty_battery_model ?? "");
  const [battKwh,   setBattKwh]   = useState<number | "">(lead.warranty_battery_kwh ?? "");
  const [invBrand, setInvBrand] = useState<string>(lead.warranty_inverter_brand ?? defaultPkg?.inverter_brand ?? "");
  const [invKw, setInvKw] = useState<number | "">(lead.warranty_inverter_kw ?? defaultPkg?.inverter_kw ?? "");

  // Wizard handler — declared here (after invBrand/invKw setters) so it can
  // mirror brand + kw + sn back into the inline dropdowns when the user
  // confirms an inverter in the AI popup.
  const saveInverterFromWizard = async (
    items: Array<{ brand: string | null; serial_no: string | null; kw?: number | null; kwh?: number | null }>
  ): Promise<{ added: number; dupes: number; reason?: string }> => {
    try {
      const cur = await apiFetch(`/api/leads/${lead.id}/devices`) as {
        inverters: Array<{ brand: string | null; kw: number | null; serial_no: string | null }>;
      };
      const existing = cur.inverters ?? [];
      const seen = new Set(existing.map(i => i.serial_no?.toLowerCase()).filter((x): x is string => !!x));
      const fresh: typeof existing = [];
      let dupes = 0;
      for (const it of items) {
        const k = it.serial_no?.toLowerCase() || "";
        if (k && seen.has(k)) { dupes++; continue; }
        if (k) seen.add(k);
        fresh.push({ brand: it.brand, kw: it.kw ?? null, serial_no: it.serial_no });
      }
      if (fresh.length === 0) {
        return { added: 0, dupes, reason: `Serial ${dupes > 1 ? "ทั้ง " + dupes + " ตัว" : ""}มีอยู่แล้ว` };
      }
      await apiFetch(`/api/leads/${lead.id}/devices`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "inverters", items: [...existing, ...fresh] }),
      });
      // Mirror the confirmed inverter into the inline dropdowns + SN input so
      // the main card reflects what the wizard captured.
      const first = fresh[0];
      if (first?.serial_no) setSn(first.serial_no);
      if (first?.brand)     setInvBrand(first.brand);
      if (first?.kw != null) setInvKw(first.kw);
      setOpenInverterWizard(false);
      return { added: fresh.length, dupes };
    } catch {
      return { added: 0, dupes: 0, reason: "บันทึกไม่สำเร็จ ลองอีกครั้ง" };
    }
  };
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

  // ── Mirror "what was actually installed" from the install checklist. ─────
  // Install is the source of truth (technician records actual equipment on
  // site). Warranty fields default to that snapshot but can be overridden by
  // the operator — only fill from install for fields that are still empty so
  // any user override sticks across re-mounts.
  const installMirroredRef = useRef(false);
  useEffect(() => {
    if (installMirroredRef.current) return;
    installMirroredRef.current = true;
    // Fetch install_checklist (full snapshot) AND lead_inverters/_batteries/
    // _panels (Equipment-Serial tab data) in parallel, then mirror missing
    // values from either source. install_checklist wins when both have data
    // for the same field; devices fills the gap when install isn't filled.
    Promise.all([
      apiFetch(`/api/install-checklist/${lead.id}`).catch(() => null) as Promise<{ system_specs?: string | null } | null>,
      apiFetch(`/api/leads/${lead.id}/devices`).catch(() => null) as Promise<{
        inverters?: Array<{ brand: string | null; kw: number | null; serial_no: string | null }>;
        batteries?: Array<{ brand: string | null; kwh: number | null; serial_no: string | null }>;
        panels?: Array<{ brand: string | null; serial_no: string | null }>;
      } | null>,
    ]).then(([row, dev]) => {
      let specs: { inverter?: { brand?: string; kw?: number | null; phase?: string; sn?: string }; panel?: { brand?: string; model?: string; count?: number | null; watt?: number | null; total_kwp?: number | null }; battery?: { brand?: string; model?: string; kwh?: number | null } } = {};
      if (row?.system_specs) {
        try { specs = JSON.parse(row.system_specs); } catch { /* fall through to devices-only mirror */ }
      }
      const inv = specs.inverter || {};
      const pn  = specs.panel    || {};
      const bt  = specs.battery  || {};
      // First-hand from install JSON ─────────────────────────────────────
      if (!invBrand && inv.brand) setInvBrand(inv.brand);
      if (invKw === "" && typeof inv.kw === "number") setInvKw(inv.kw);
      if (!phase && inv.phase) setPhase(inv.phase);
      if (!sn && inv.sn) setSn(inv.sn);
      if (!panelBrand && pn.brand) setPanelBrand(pn.brand);
      if (!panelModel && pn.model) setPanelModel(pn.model);
      if (panelCount === "" && typeof pn.count === "number") setPanelCount(pn.count);
      if (panelWatt === "" && typeof pn.watt === "number") setPanelWatt(pn.watt);
      if (sysKwp === "" && typeof pn.total_kwp === "number") setSysKwp(pn.total_kwp);
      if (!battBrand && bt.brand) setBattBrand(bt.brand);
      if (!battModel && bt.model) setBattModel(bt.model);
      if (battKwh === "" && typeof bt.kwh === "number") setBattKwh(bt.kwh);
      // Second-hand from Equipment-Serial tables (gap-fill only) ─────────
      // lead_batteries[].brand / .kwh — use the first row that has the value.
      const battRow = dev?.batteries?.find(b => b.brand || b.kwh != null);
      if (battRow) {
        if (!battBrand && !bt.brand && battRow.brand) setBattBrand(battRow.brand);
        if (battKwh === "" && bt.kwh == null && typeof battRow.kwh === "number") setBattKwh(battRow.kwh);
      }
      // lead_inverters[].brand / .kw — same gap-fill.
      const invRow = dev?.inverters?.find(i => i.brand || i.kw != null || i.serial_no);
      if (invRow) {
        if (!invBrand && !inv.brand && invRow.brand) setInvBrand(invRow.brand);
        if (invKw === "" && inv.kw == null && typeof invRow.kw === "number") setInvKw(invRow.kw);
        if (!sn && !inv.sn && invRow.serial_no) setSn(invRow.serial_no);
      }
      // lead_panels[].brand + COUNT(*) — panel count comes "for free" from
      // the serials table since each row is one panel.
      const panelRows = dev?.panels ?? [];
      const firstPanelBrand = panelRows.find(p => p.brand)?.brand;
      if (firstPanelBrand && !panelBrand && !pn.brand) setPanelBrand(firstPanelBrand);
      if (panelRows.length > 0 && panelCount === "" && pn.count == null) setPanelCount(panelRows.length);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

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
  // Pull the official Huawei warranty certificate for the inverter SN and store
  // it as the inverter manufacturer cert (warranty_inverter_cert_url) so the
  // issued warranty PDF merges it in automatically. Captcha is solved server-side.
  const fetchHuaweiCert = async () => {
    const serial = sn.trim();
    if (!serial) { setNextError("กรอก Serial Number ของอินเวอร์เตอร์ Huawei ก่อน"); return; }
    setHuaweiLoading(true);
    setHuaweiInfo(null);
    try {
      const r = await apiFetch("/api/huawei-warranty", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serial_no: serial, lead_id: lead.id }),
      }) as { ok?: boolean; url?: string | null; error?: string; info?: { servicePackage: string; startDate: string; endDate: string } };
      if (!r.ok) { setNextError(r.error || "ดึงข้อมูล Huawei ไม่สำเร็จ"); return; }
      if (r.info) setHuaweiInfo({ servicePackage: r.info.servicePackage, startDate: r.info.startDate, endDate: r.info.endDate });
      if (r.url) {
        // Overwrite outright — replace whatever inverter cert was there. Re-fetch
        // is intentional, so no confirm; just delete the file we're replacing so
        // repeated pulls don't pile up orphans in public/uploads.
        const prev = inverterCertUrl;
        setInverterCertUrl(r.url);
        await apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ warranty_inverter_cert_url: r.url }) });
        if (prev && prev !== r.url) {
          fetch(`/api/upload?file=${encodeURIComponent(prev)}`, { method: "DELETE", headers: { ...getUserIdHeader() } }).catch(() => {});
        }
      }
    } catch (e) {
      setNextError(e instanceof Error ? e.message : "ดึงข้อมูล Huawei ไม่สำเร็จ");
    } finally { setHuaweiLoading(false); }
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

  const endDate = addYears(startDate, durationYears);

  // Auto-save SN / doc no / start date / equipment snapshot.
  //
  // Dual-write during the lead_inverters/_batteries/_panels migration:
  //   1. PATCH /api/leads/[id] — legacy warranty_* columns (still source of
  //      truth for the public /warranty/[id] page until Phase 3 lands).
  //   2. PUT  /api/leads/[id]/devices (×3 types) — new normalised tables.
  // Both run in the same debounce tick so they stay in lock-step. Remove the
  // legacy PATCH for the device columns once the public page is migrated.
  useEffect(() => {
    if (state !== "active") return;
    const t = setTimeout(() => {
      // 1. legacy PATCH
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
          warranty_panel_model: panelModel || null,
          warranty_battery_brand: battBrand || null,
          warranty_battery_model: battModel || null,
          warranty_battery_kwh:   battKwh === "" ? null : battKwh,
          warranty_duration_years: durationYears,
          warranty_om_per_year:    omPerYear,
          warranty_inverter_brand: invBrand || null,
          warranty_inverter_kw: invKw === "" ? null : invKw,
          warranty_electrical_phase: phase || null,
          warranty_batteries: JSON.stringify(batteries.filter(b => b.brand || b.kwh || b.serial).map(b => ({ brand: b.brand || null, kwh: b.kwh ? parseFloat(b.kwh) : null, serial: b.serial || null }))),
          warranty_has_battery: batteries.some(b => b.brand || b.kwh || b.serial),
          warranty_panel_serials: panelSerials.some(s => s.trim()) ? JSON.stringify(panelSerials.map(s => s.trim())) : null,
        }),
      }).catch(console.error);
      // NOTE: PUT to /api/leads/[id]/devices was removed here. The new
      // Serials tab on the lead detail page is the single owner of the
      // lead_inverters/_batteries/_panels tables now. Keeping the dual-write
      // here was clobbering Serials-tab writes with null SNs whenever this
      // effect ran while sn was empty in this step's form.
    }, 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sn, docNo, startDate, sysKwp, panelCount, panelWatt, panelBrand, panelModel, battBrand, battModel, battKwh, durationYears, omPerYear, invBrand, invKw, phase, batteries, panelSerials, inverterCertUrl]);

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
      {/* Warranty download removed — "ใบรับประกัน" button lives in the doneHeader now. */}
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
              className="md:mr-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-primary/30 bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors shrink-0"
            >
              <DocumentIcon className="w-4 h-4" strokeWidth={2} />
              ใบรับประกัน
            </button>
          )}
        </>
      }
      renderDone={renderDoneContent}
      overlay={fileViewer.modal}
      subSteps={SUB_STEPS}
      subStep={subStep}
      onSubStepChange={(i) => { setSubStep(i); scrollToStep(); }}
    >
    <div className="space-y-3">
      {/* subStep 0: ข้อมูล */}
      {subStep === 0 && (<>
        {/* Header card — เลขที่เอกสาร + ระยะเวลารับประกัน, grouped like
            InstallChecklist's "หัวเอกสาร" card so the form has a clear top
            section instead of three floating fields. */}
        <div className="rounded-lg bg-white/60 border border-active/15 p-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-active/10 text-active flex items-center justify-center shrink-0"><DocumentIcon className="w-4 h-4" /></span>
            DOCUMENT HEADER
          </div>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            <div className="col-span-1 md:col-span-1">
              <label className="text-xs text-gray-500 block mb-1">เลขที่เอกสาร</label>
              <input value={docNo} onChange={e => setDocNo(e.target.value)} placeholder="SSE-260001"
                className="w-full h-8 px-3 rounded-lg border border-gray-200 font-mono text-sm focus:outline-none focus:border-primary" />
            </div>
            <div className="col-span-1 md:col-span-1">
              <label className="text-xs text-gray-500 block mb-1">รับประกันงานติดตั้ง</label>
              <ThaiDateInput value={startDate} onChange={setStartDate} disabled={durationYears === 0} />
            </div>
            <div className="col-span-1 md:col-span-1">
              <label className="text-xs text-gray-500 block mb-1">ระยะเวลา (ปี)</label>
              <NumberStepper value={durationYears} onChange={v => setDurationYears(v ?? 0)} min={0} max={20} />
            </div>
            <div className="col-span-1 md:col-span-1">
              <label className="text-xs text-gray-500 block mb-1">สิ้นสุด (+{durationYears} ปี)</label>
              <input value={durationYears === 0 ? "-" : (endDate ? isoToBE(endDate) : "")} readOnly
                className="w-full h-8 px-3 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 text-sm font-mono tabular-nums" />
            </div>
            <div className="col-span-1 md:col-span-1">
              <label className="text-xs text-gray-500 block mb-1">O&M (ครั้ง/ปี)</label>
              <NumberStepper value={omPerYear} onChange={v => setOmPerYear(v ?? 0)} min={0} max={12} disabled={durationYears === 0} />
            </div>
            {/* "ไม่มีการรับประกัน" toggle — checking it zeroes out the
                duration, which the PDF templates already read as "no
                warranty" and swap to "-" for every derived value. */}
            <div className="col-span-2 md:col-span-2 flex items-end">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none h-8 px-2 rounded-lg hover:bg-gray-50 text-sm text-gray-700">
                {/* Round checkbox — no built-in accent color on rounded native
                    checkboxes across browsers, so we build our own with an
                    appearance-none input + inner dot rendered via a peer
                    ring. */}
                <span className="relative inline-flex items-center justify-center w-4 h-4">
                  <input
                    type="checkbox"
                    className="peer appearance-none w-4 h-4 rounded-full border border-gray-300 checked:border-active checked:bg-active cursor-pointer transition-colors"
                    checked={durationYears === 0}
                    onChange={(e) => {
                      if (e.target.checked) setDurationYears(0);
                      else setDurationYears(2);
                    }}
                  />
                  <svg
                    className="absolute w-2.5 h-2.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none"
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                ไม่มีการรับประกัน
              </label>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <div className="text-xs font-semibold tracking-wider uppercase text-gray-500 flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-active/10 text-active flex items-center justify-center shrink-0"><BoltIcon className="w-4 h-4" /></span>
            INSTALLED EQUIPMENT
          </div>

          {/* Inverter group — same shape as InstallChecklist §1.1: three
              dropdowns in one 7-col row, SN+camera on the row below. */}
          <div className="rounded-lg border border-gray-200 bg-white/50 p-3 space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Inverter</div>

            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              <div className="col-span-1 md:col-span-1">
                <label className="text-xs text-gray-500 block mb-1">ยี่ห้อ</label>
                <Dropdown
                  value={invBrand}
                  onChange={v => setInvBrand(v)}
                  options={INVERTER_BRANDS.map(b => ({ value: b, label: b }))}
                />
              </div>
              <div className="col-span-1 md:col-span-1">
                <label className="text-xs text-gray-500 block mb-1">ขนาด (kW)</label>
                <Dropdown
                  value={invKw === "" ? "" : String(invKw)}
                  onChange={v => setInvKw(v ? parseFloat(v) : "")}
                  options={INVERTER_KW_SIZES.map(kw => ({ value: String(kw), label: `${kw} kW` }))}
                  buttonClassName="font-mono tabular-nums"
                />
              </div>
              <div className="col-span-1 md:col-span-1">
                <label className="text-xs text-gray-500 block mb-1">Phase <span className="text-red-500">*</span></label>
                <Dropdown
                  value={phase}
                  onChange={v => setPhase(v)}
                  options={Object.entries(PHASE_LABEL).map(([v, l]) => ({ value: v, label: l }))}
                />
              </div>
            </div>

            {/* Serial Number — manual input stays (some users key it in
                directly). The "AI ช่วยอ่าน Serial" button opens the shared
                add-device wizard so the captured SN also lands in
                lead_inverters for the cert. */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Serial Number</label>
              <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                <input value={sn} onChange={e => setSn(e.target.value)} placeholder="HW1234567890"
                  className="col-span-2 md:col-span-3 w-full h-8 px-3 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:border-primary" />
                <button type="button"
                  onClick={() => setOpenInverterWizard(true)}
                  title="AI อ่าน Serial"
                  className="col-span-1 md:col-span-1 h-8 rounded-lg text-white bg-active hover:brightness-110 flex items-center justify-center transition-colors">
                  <span className="relative inline-flex items-center justify-center">
                    <CameraIcon className="w-5 h-5" strokeWidth={2} />
                    <svg className="absolute -top-1 -right-1 w-3 h-3 text-amber-300 drop-shadow" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0l2.4 7.6L22 10l-7.6 2.4L12 20l-2.4-7.6L2 10l7.6-2.4L12 0z" />
                    </svg>
                  </span>
                </button>
              </div>
              <div className="text-xs text-gray-400 mt-1">กดปุ่ม AI เพื่อถ่ายรูปฉลาก — ระบบจะอ่าน Serial และบันทึกให้อัตโนมัติ</div>

              {/* Huawei only: pull the manufacturer warranty certificate by SN.
                  The returned PDF is stored as the inverter cert and merged into
                  the issued warranty document. */}
              {invBrand.trim().toLowerCase() === "huawei" && (
                <div className="mt-2 space-y-1.5">
                  <button type="button" onClick={fetchHuaweiCert} disabled={huaweiLoading || !sn.trim()}
                    className={`w-full h-9 rounded-lg text-sm font-semibold text-white bg-[#CF0A2C] hover:brightness-110 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5 ${huaweiLoading ? "opacity-90" : "disabled:bg-gray-300"}`}>
                    {huaweiLoading
                      ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : <DocumentIcon className="w-4 h-4" />}
                    {huaweiLoading ? "กำลังดึงจาก Huawei..." : inverterCertUrl ? "ดึงใหม่ (ทับของเดิม)" : "ดึงใบรับประกันจาก Huawei"}
                  </button>
                  {/* Persistent status (survives reload): read from the saved cert
                      URL so it shows even when the file lives on the เอกสาร tab.
                      A "huawei_warranty" filename marks a successful Huawei pull;
                      anything else is a manually-uploaded inverter cert. */}
                  {inverterCertUrl && (
                    <div className={`text-xs rounded-lg px-3 py-2 border ${inverterCertUrl.includes("huawei_warranty") ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-gray-600 bg-gray-50 border-gray-200"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{inverterCertUrl.includes("huawei_warranty") ? "✓ ดึงใบรับประกัน Huawei แล้ว" : "มีใบรับประกัน Inverter แล้ว (อัปโหลดเอง)"}</span>
                        <a href={inverterCertUrl} onClick={fileViewer.handler(inverterCertUrl, "ใบรับประกัน Inverter")} className="underline shrink-0 hover:opacity-80">ดูไฟล์</a>
                      </div>
                      {huaweiInfo
                        ? <span className="block mt-0.5 opacity-80">{huaweiInfo.servicePackage} · {huaweiInfo.startDate} → {huaweiInfo.endDate}</span>
                        : <span className="block mt-0.5 opacity-70">อยู่ในแท็บ “เอกสาร” → ใบรับประกันอินเวอร์เตอร์</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Panel group — ขนาดระบบ + จำนวน + วัตต์ + ยี่ห้อ in a 7-col row. */}
          <div className="rounded-lg border border-gray-200 bg-white/50 p-3 space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Panel</div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              <div className="col-span-1 md:col-span-1">
                <label className="text-xs text-gray-500 block mb-1">ยี่ห้อ</label>
                <Dropdown
                  value={panelBrand}
                  onChange={v => setPanelBrand(v)}
                  options={PANEL_BRANDS.map(b => ({ value: b, label: b }))}
                />
              </div>
              <div className="col-span-1 md:col-span-2">
                <label className="text-xs text-gray-500 block mb-1">รุ่น</label>
                <input type="text" value={panelModel} onChange={e => setPanelModel(e.target.value)} placeholder="JKM640N-66HL4M-BDV-Z1-EU" className="w-full h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div className="col-span-1 md:col-span-1">
                <label className="text-xs text-gray-500 block mb-1">จำนวน (แผง)</label>
                <NumberStepper
                  value={typeof panelCount === "number" ? panelCount : null}
                  onChange={v => setPanelCount(v == null ? "" : v)}
                />
              </div>
              <div className="col-span-1 md:col-span-1">
                <label className="text-xs text-gray-500 block mb-1">วัตต์/แผง</label>
                <input type="number" value={panelWatt} onChange={e => setPanelWatt(e.target.value ? parseInt(e.target.value) : "")} placeholder="550" className="w-full h-8 px-3 rounded-lg border border-gray-200 font-mono text-sm focus:outline-none focus:border-primary" />
              </div>
              <div className="col-span-1 md:col-span-1">
                <label className="text-xs text-gray-500 block mb-1">ขนาดติดตั้ง (kWp)</label>
                <input type="number" step="0.01" value={sysKwp} onChange={e => setSysKwp(e.target.value ? parseFloat(e.target.value) : "")} placeholder="5.00" className="w-full h-8 px-3 rounded-lg border border-gray-200 font-mono text-sm focus:outline-none focus:border-primary" />
              </div>
            </div>
          </div>

          {/* Battery summary — mirrors Install §1.4. Per-row + OCR battery list
              lives in subStep 2. This card is just the aggregate brand/model/
              kWh for the warranty cert. */}
          <div className="rounded-lg border border-gray-200 bg-white/50 p-3 space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Battery</div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              <div className="col-span-1 md:col-span-1">
                <label className="text-xs text-gray-500 block mb-1">ยี่ห้อ</label>
                <input type="text" value={battBrand} onChange={e => setBattBrand(e.target.value)} className="w-full h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div className="col-span-1 md:col-span-2">
                <label className="text-xs text-gray-500 block mb-1">รุ่น</label>
                <input type="text" value={battModel} onChange={e => setBattModel(e.target.value)} className="w-full h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary" />
              </div>
              <div className="col-span-1 md:col-span-1">
                <label className="text-xs text-gray-500 block mb-1">ขนาด (kWh)</label>
                <input type="number" step="0.1" value={battKwh} onChange={e => setBattKwh(e.target.value ? parseFloat(e.target.value) : "")} className="w-full h-8 px-3 rounded-lg border border-gray-200 font-mono text-sm focus:outline-none focus:border-primary" />
              </div>
            </div>
          </div>
        </div>
      </>)}

      {/* subStep 2: แบตเตอรี่ — uses the shared SerialsUploader (same modal
          pattern as the Serials tab on the lead page). Data persists to the
          normalised lead_batteries table; the warranty cert prefers those over
          the legacy warranty_batteries JSON column. quickKey enables the
          inline "type SN + Enter" row so users can key serials directly. */}
      {subStep === 2 && (
        <SerialsUploader
          leadId={lead.id}
          showTypes={["batteries"]}
          quickKey
          slotCounts={{ batteries: 5 }}
          locked={lead.status === "gridtie" || lead.status === "closed"}
        />
      )}

      {/* subStep 1: แผง — text list of per-panel serial numbers (max PANEL_ROWS).
         Optional AI bulk-scan zone at top: upload one or more photos (each may
         contain many panel labels), Gemini extracts all serials in one call and
         fills into empty slots below. */}
      {subStep === 1 && (
        <SerialsUploader
          leadId={lead.id}
          showTypes={["panels"]}
          quickKey
          slotCounts={{ panels: 20 }}
          slotColumns={{ panels: 2 }}
          locked={lead.status === "gridtie" || lead.status === "closed"}
        />
      )}

      {/* subStep 3: เอกสาร */}
      {subStep === 3 && (<>
        <div className="space-y-2">
          <CertSlot label="ใบรับประกันอินเวอร์เตอร์ (ผู้ผลิต)" url={inverterCertUrl} uploading={uploadingField === "inverter"} inputId={`inv-cert-${lead.id}`} onChange={handleInverterCert} onRemove={() => removeCert("inverter")} />
          <CertSlot label="ใบรับประกันแผงโซลาร์ (ผู้ผลิต)" url={panelCertUrl} uploading={uploadingField === "panel"} inputId={`pnl-cert-${lead.id}`} onChange={handlePanelCert} onRemove={() => removeCert("panel")} />
        </div>
        <div>
          <label className="text-xs font-semibold tracking-wider uppercase text-gray-500 block mb-1 flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-active/10 text-active flex items-center justify-center shrink-0"><DocumentIcon className="w-4 h-4" /></span>
            OTHER ATTACHMENTS
          </label>
          {otherDocs.length > 0 && (
            <div className="space-y-1.5 mb-2">
              {otherDocs.map(url => {
                const name = url.split("/").pop() || "ไฟล์";
                return (
                  <div key={url} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                    <a href={url} onClick={fileViewer.handler(url, name)} className="flex-1 min-w-0 truncate text-sm text-gray-700 hover:text-primary">{name}</a>
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
            <div className="text-xs font-semibold tracking-wider uppercase text-gray-500 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-active/10 text-active flex items-center justify-center shrink-0"><UserIcon className="w-4 h-4" /></span>
              CUSTOMER SIGNATURE
            </div>
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
                    docNo,
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
      {openInverterWizard && (
        <AddDeviceModal
          type="inverters"
          onCancel={() => setOpenInverterWizard(false)}
          onSave={saveInverterFromWizard}
        />
      )}
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
  const viewer = useFileViewer();
  return (
    <div>
      <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-1">{label}</label>
      {url ? (
        <div className="relative">
          <a href={url} onClick={viewer.handler(url, label)} className="flex items-center gap-2 p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50">
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
      {viewer.modal}
    </div>
  );
}
