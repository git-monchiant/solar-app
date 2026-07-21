"use client";
import { BoltIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon, XIcon } from "@/components/ui/icons";

import { useEffect, useRef, useState } from "react";
import { apiFetch, getUserIdHeader } from "@/lib/api";
import { useMe } from "@/lib/roles";
import type { StepCommonProps, Package, Lead } from "./types";
import SurveyForm, { type SurveyFormHandle } from "./SurveyForm";
import AppointmentRescheduler from "@/components/calendar/AppointmentRescheduler";
import ErrorPopup from "@/components/ui/ErrorPopup";
import NumberStepper from "@/components/ui/NumberStepper";
import { validateSurvey } from "@/lib/constants/step-validators";
import FallbackImage from "@/components/ui/FallbackImage";
import StepLayout from "../StepLayout";
import SignaturePad from "../SignaturePad";
import SurveyPdfModal from "../SurveyPdfModal";
import { useSubStep } from "@/lib/hooks/useSubStep";
import { compressImage } from "@/lib/utils/compressImage";
import { isMobileDevice, openInNewTab } from "@/lib/utils/device";
import { buildAppointmentFlex, buildSurveyResultFlex } from "@/lib/utils/line-flex";
import { formatSlotsRange } from "@/lib/time-slots";
import { formatThaiDate as formatDate } from "@/lib/utils/formatters";
import DoneSection from "./DoneSection";
import {
  ROOF_MATERIAL_LABEL as ROOF_MATERIAL_MAP,
  ORIENTATION_LABEL as ORIENTATION_MAP,
  SHADING_LABEL as SHADING_MAP,
  METER_SIZE_LABEL as METER_MAP,
  MDB_SLOTS_LABEL as MDB_SLOTS_MAP,
  BREAKER_LABEL as BREAKER_MAP,
  ROOF_STRUCTURE_LABEL as ROOF_STRUCTURE_MAP,
  INVERTER_LOCATION_LABEL as INVERTER_LOC_MAP,
  WIFI_LABEL as WIFI_MAP,
  ACCESS_LABEL as ACCESS_MAP,
  APPLIANCE_LABEL as APPLIANCE_MAP,
  BATTERY_LABEL as BATTERY_MAP,
  PHASE_LABEL as PHASE_MAP,
  labelFor as otherLabel,
} from "@/lib/constants/survey-options";

interface Props extends StepCommonProps {
  onAddActivity: (type: string) => void;
  packages: Package[];
  expanded?: boolean;
  onToggle?: () => void;
}

export default function SurveyStep({ lead, state, refresh, packages, expanded, onToggle }: Props) {
  const SURVEY_SUB_FULL = ["นัด", "ไฟฟ้า", "หลังคา", "เตรียม", "ยืนยัน"];
  const SURVEY_SUB = lead.survey_confirmed ? SURVEY_SUB_FULL : ["นัด"];
  const [subStep, setSubStep] = useSubStep(`surveySubStep_${lead.id}`, 0, SURVEY_SUB.length);
  const [nextError, setNextError] = useState<string | null>(null);
  const [formDraft, setFormDraft] = useState<Partial<Lead>>({});
  const formRef = useRef<SurveyFormHandle>(null);
  const [selectedPkgs, setSelectedPkgs] = useState<string[]>(
    lead.interested_package_ids ? lead.interested_package_ids.split(",").filter(Boolean) : lead.interested_package_id ? [String(lead.interested_package_id)] : []
  );
  const [packageNote, setPackageNote] = useState<string>(lead.package_note ?? "");
  const [quotationType, setQuotationType] = useState<string>(lead.quotation_type ?? "standard");
  const MAX_PKGS = 3;
  const [surveyBattery, setSurveyBattery] = useState<string>(lead.survey_wants_battery ?? lead.pre_wants_battery ?? "");
  const [recommendedKw, setRecommendedKw] = useState<number | null>(lead.survey_recommended_kw ?? null);
  const [panelCount, setPanelCount] = useState<number | "">(lead.survey_panel_count ?? "");
  // Customize-tab state — 3 fixed integer counts. Free-text notes reuse the
  // existing package_note field. Stored as a single JSON object in
  // leads.survey_customize_items.
  type CustomizeData = { panel: number; battery: number; inverter: number };
  const [customizeData, setCustomizeData] = useState<CustomizeData>(() => {
    const raw = lead.survey_customize_items;
    if (raw) {
      try {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          return {
            panel: Number(obj.panel) || 0,
            battery: Number(obj.battery) || 0,
            inverter: Number(obj.inverter) || 0,
          };
        }
      } catch { /* fall through */ }
    }
    return { panel: 0, battery: 0, inverter: 0 };
  });
  const patchCustomizeData = (next: CustomizeData) => {
    setCustomizeData(next);
    apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ survey_customize_items: JSON.stringify(next) }),
    }).catch(console.error);
  };
  const [surveyPhase, setSurveyPhase] = useState<string>(lead.survey_electrical_phase ?? lead.pre_electrical_phase ?? "");
  const [rescheduling, setRescheduling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(lead.survey_customer_signature_url);
  const [surveyNote, setSurveyNote] = useState<string>(lead.survey_note ?? "");
  const [surveyPhotos, setSurveyPhotos] = useState<string[]>(lead.survey_photos ? lead.survey_photos.split(",").filter(Boolean) : []);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [locSaving, setLocSaving] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [locEditing, setLocEditing] = useState(false);
  const [locInput, setLocInput] = useState("");
  const { me } = useMe();
  // Default actual visit date = today, actual surveyor = current user when blank.
  const todayIso = new Date().toISOString().slice(0, 10);
  const [actualDate, setActualDate] = useState<string>(
    lead.survey_actual_date ? String(lead.survey_actual_date).slice(0, 10) : todayIso
  );
  const [actualBy, setActualBy] = useState<string>(lead.survey_actual_by ?? "");
  // Once /api/me resolves, fill actualBy if it's still blank (and the lead had no value).
  useEffect(() => {
    if (!actualBy && me?.full_name && !lead.survey_actual_by) setActualBy(me.full_name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const saveLocation = async (lat: number, lng: number) => {
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey_lat: lat, survey_lng: lng }),
      });
      await refresh();
    } catch (e) {
      setLocError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
      throw e;
    }
  };

  const parseCoords = (input: string): { lat: number; lng: number } | null => {
    if (!input) return null;
    // Handles "13.7,100.5" / "13.7 100.5" / "13.7,+100.5" (Google Maps search
    // URLs encode the space after the comma as "+"). Skip the "+" if it
    // immediately precedes the second number so it's not consumed as sign.
    const m = input.match(/(-?\d{1,3}\.\d{3,})[\s,+/]+\+?(-?\d{1,3}\.\d{3,})/);
    if (!m) return null;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  };

  const submitPastedLocation = async () => {
    setLocError(null);
    setLocSaving(true);
    try {
      // Try parsing the input as-is first (long Google Maps URLs include
      // @lat,lng directly). If that fails, treat it as a short link and ask
      // the server to follow the redirect, then re-parse the expanded URL.
      let parsed = parseCoords(locInput);
      if (!parsed && /^https?:\/\//i.test(locInput.trim())) {
        try {
          const r = await apiFetch(`/api/maps/resolve?url=${encodeURIComponent(locInput.trim())}`);
          if (r.url) parsed = parseCoords(r.url);
        } catch { /* fall through to error below */ }
      }
      if (!parsed) {
        setLocError("ไม่พบพิกัด (รองรับ Google Maps URL หรือ short link)");
        return;
      }
      await saveLocation(parsed.lat, parsed.lng);
      setLocEditing(false);
      setLocInput("");
    } catch {
      // error already set in saveLocation
    } finally {
      setLocSaving(false);
    }
  };

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setLocError("อุปกรณ์นี้ไม่รองรับ GPS");
      return;
    }
    setLocError(null);
    setLocSaving(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          await saveLocation(pos.coords.latitude, pos.coords.longitude);
        } catch {
          // error set in saveLocation
        } finally {
          setLocSaving(false);
        }
      },
      err => {
        setLocSaving(false);
        setLocError(err.code === err.PERMISSION_DENIED ? "ไม่ได้รับอนุญาตใช้ GPS" : "หาตำแหน่งไม่สำเร็จ");
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };
  // Mobile → in-app modal preview (same UX as the other file viewers, gives a
  // close X in PWA standalone). Desktop → just open the survey PDF in a new tab.
  // URL must match SurveyPdfModal's so the server resolves the same signer.
  const openPdf = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isMobileDevice()) {
      setPdfPreviewOpen(true);
    } else {
      openInNewTab(me?.id ? `/api/survey/${lead.id}?user_id=${me.id}` : `/api/survey/${lead.id}`);
    }
  };
  // Auto-save survey note (debounced)
  useEffect(() => {
    if (!lead.survey_confirmed) return;
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey_note: surveyNote || null }),
      }).catch(console.error);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveyNote]);

  // Auto-save package note (debounced) — same pattern as surveyNote.
  useEffect(() => {
    if (!lead.survey_confirmed) return;
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_note: packageNote || null }),
      }).catch(console.error);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageNote]);

  // NOTE: We deliberately DO NOT auto-PATCH survey_actual_date here. That
  // column doubles as the "survey actually happened" signal in
  // /api/surveys/scheduled (`survey_actual_date IS NULL` keeps the slot
  // locked). Auto-saving the today-default would silently free every open
  // survey lead from the lock pool, hiding their slots from other pickers.
  // Instead, the values flow into DB via markDone() / handleNext() — the
  // local state seeds the form so a mid-step refresh re-shows the same
  // defaults without persisting them.



  const slotLabel = formatSlotsRange(lead.survey_time_slot) || lead.survey_time_slot;

  const persistPhotos = async (next: string[]) => {
    setSurveyPhotos(next);
    await apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ survey_photos: next.length ? next.join(",") : null }),
    });
    refresh();
  };

  // Upload-and-persist core, shared by the file-input change handler and the
  // drop-zone drop handler. Sequential upload + single persist avoids the
  // stale-closure race that bit InstallStep's multi-upload before.
  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;
    setPhotoUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        const compressed = await compressImage(file).catch(() => file);
        const fd = new FormData();
        fd.append("file", compressed);
        fd.append("filename", `lead${lead.id}_survey_${Date.now()}`);
        const res = await fetch("/api/upload", {
          method: "POST",
          body: fd,
          headers: { "ngrok-skip-browser-warning": "true", ...getUserIdHeader() },
        });
        const { url } = await res.json();
        uploaded.push(url);
      }
      await persistPhotos([...surveyPhotos, ...uploaded]);
    } finally {
      setPhotoUploading(false);
    }
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    await uploadFiles(files);
  };

  const [photoDragActive, setPhotoDragActive] = useState(false);

  const removePhoto = async (url: string) => {
    fetch(`/api/upload?file=${encodeURIComponent(url)}`, {
      method: "DELETE",
      headers: { "ngrok-skip-browser-warning": "true", ...getUserIdHeader() },
    }).catch(() => {});
    await persistPhotos(surveyPhotos.filter(u => u !== url));
  };

  const [notifyLine, setNotifyLine] = useState(true);
  const [notifyDoneLine, setNotifyDoneLine] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendResult, setResendResult] = useState<null | "ok" | "err">(null);

  const buildSurveyMessage = () => {
    if (!lead.survey_date) return null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return buildAppointmentFlex({
      origin,
      kind: "survey",
      name: lead.full_name,
      date: lead.survey_date,
      timeSlot: lead.survey_time_slot,
      address: lead.installation_address,
      project: lead.project_name,
      documents: ["บิลค่าไฟฟ้าล่าสุด"],
    });
  };

  const confirmAppointment = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey_confirmed: true }),
      });
      if (notifyLine && lead.line_id) {
        const msg = buildSurveyMessage();
        if (msg) {
          apiFetch("/api/line/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lead_id: lead.id, messages: [msg] }),
          }).catch(console.error);
        }
      }
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const resendAppointmentLine = async () => {
    if (!lead.line_id) return;
    const msg = buildSurveyMessage();
    if (!msg) return;
    setResending(true);
    setResendResult(null);
    try {
      await apiFetch("/api/line/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: lead.id, messages: [msg] }),
      });
      setResendResult("ok");
    } catch {
      setResendResult("err");
    } finally {
      setResending(false);
      setTimeout(() => setResendResult(null), 3000);
    }
  };

  const saveReschedule = async ({ date, slot }: { date: string; slot: string }) => {
    await apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ survey_date: date, survey_time_slot: slot, survey_confirmed: false }),
    });
    setRescheduling(false);
    refresh();
  };

  const markDone = async () => {
    // Pull fresh lead state — auto-saves from SurveyForm subSteps write to DB
    // but don't refresh() parent, so `lead` prop may be stale. Refetch before
    // validating so we don't false-flag fields the user has already filled.
    const fresh = await apiFetch(`/api/leads/${lead.id}`) as Lead;
    const v = validateSurvey({
      ...fresh,
      survey_note: surveyNote || fresh.survey_note,
      survey_photos: surveyPhotos.length ? surveyPhotos.join(",") : fresh.survey_photos,
      survey_wants_battery: surveyBattery || fresh.survey_wants_battery,
      survey_electrical_phase: surveyPhase || fresh.survey_electrical_phase,
      survey_recommended_kw: recommendedKw ?? fresh.survey_recommended_kw,
      survey_panel_count: typeof panelCount === "number" ? panelCount : fresh.survey_panel_count,
      interested_package_id: selectedPkgs.length ? parseInt(selectedPkgs[0]) : fresh.interested_package_id,
      interested_package_ids: selectedPkgs.length ? selectedPkgs.join(",") : fresh.interested_package_ids,
      // Local default for actualDate is today + actualBy is current user; DB
      // stays null until this PATCH below fires. Merge them in so validation
      // doesn't false-flag the unsaved defaults.
      survey_actual_date: actualDate || fresh.survey_actual_date,
      survey_actual_by: actualBy || fresh.survey_actual_by,
    });
    if (!v.valid) {
      setNextError(v.missing.map(m => m.label).join(", "));
      return;
    }
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "quote",
          survey_actual_date: actualDate || null,
          survey_actual_by: actualBy || null,
          // Stamp the user who clicked "สำรวจเสร็จสิ้น" so PDFs can render their signature.
          survey_completed_by: me?.id ?? null,
        }),
      });
      // Optionally push the survey result to the customer's LINE so they can
      // download the signed PDF without waiting for staff to send it manually.
      if (notifyDoneLine && lead.line_id) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const systemMap: Record<string, string> = { yes: "Solar + Battery", no: "On Grid", upgrade: "Upgrade", maybe: "ยังไม่แน่ใจ" };
        const battKey = surveyBattery || fresh.survey_wants_battery || "";
        const systemLabel = battKey.startsWith("other:") ? battKey.slice(6) : (systemMap[battKey] || null);
        const chosenPkg = packages.find(p => p.id === (selectedPkgs.length ? parseInt(selectedPkgs[0]) : fresh.interested_package_id));
        const msg = buildSurveyResultFlex({
          origin,
          name: lead.full_name,
          surveyDate: actualDate || lead.survey_actual_date || lead.survey_date || new Date().toISOString().slice(0, 10),
          recommendedKw: recommendedKw ?? fresh.survey_recommended_kw,
          systemLabel,
          panelCount: typeof panelCount === "number" ? panelCount : fresh.survey_panel_count,
          packageLabel: chosenPkg ? `${chosenPkg.name} ${chosenPkg.kwp} kWp` : null,
          pdfUrl: `${origin}/api/survey/${lead.id}`,
        });
        apiFetch("/api/line/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lead_id: lead.id, messages: [msg] }),
        }).catch(console.error);
      }
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const slotTime = formatSlotsRange(lead.survey_time_slot);

  const doneHeaderContent = (
    <>
      {lead.survey_date ? (
        <span className="text-sm font-bold text-gray-900 leading-tight flex-1">
          <span className="block">สำรวจ {new Date(String(lead.survey_date).slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
          {slotTime && <span className="block font-mono tabular-nums text-xs text-gray-500">{slotTime}</span>}
        </span>
      ) : <span className="flex-1" />}
      <button
        type="button"
        onClick={openPdf}
        className="mr-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-primary/30 bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors shrink-0"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        ใบสำรวจ
      </button>
    </>
  );

  if (state === "done") {
    const applianceList = (lead.survey_appliances || "").split(",").filter(Boolean).map(v => APPLIANCE_MAP[v] || v);
    const pkgIds = (lead.interested_package_ids || "").split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    const selectedPackages: Package[] = pkgIds.length
      ? pkgIds.map(id => packages.find(p => p.id === id)).filter((p): p is Package => !!p)
      : lead.interested_package_id ? [packages.find(p => p.id === lead.interested_package_id)].filter((p): p is Package => !!p) : [];
    const photoSlots = [
      { url: lead.survey_photo_building_url, label: "อาคาร" },
      { url: lead.survey_photo_roof_structure_url, label: "โครงหลังคา" },
      { url: lead.survey_photo_mdb_url, label: "Consumer Unit / MDB" },
      { url: lead.survey_photo_inverter_point_url, label: "จุด Inverter" },
    ];

    const renderDoneContent = () => (<>

      {/* 0. ข้อมูลการเข้าสำรวจจริง */}
      {(lead.survey_actual_date || lead.survey_actual_by) && (
        <DoneSection color="teal" title="เข้าสำรวจหน้างาน">
          <div className="space-y-0.5 text-sm">
            <DoneRow label="วันที่จริง" value={lead.survey_actual_date ? formatDate(lead.survey_actual_date) : "—"} />
            <DoneRow label="ผู้สำรวจ" value={lead.survey_actual_by || "—"} />
          </div>
        </DoneSection>
      )}

      {/* 1. ระบบไฟฟ้า */}
      <DoneSection color="blue" title="ระบบไฟฟ้า">
        <div className="space-y-0.5 text-sm">
          <DoneRow label="มิเตอร์" value={lead.survey_meter_size ? METER_MAP[lead.survey_meter_size] || lead.survey_meter_size : "—"} />
          <DoneRow label="เฟส / แรงดัน" value={lead.survey_electrical_phase ? PHASE_MAP[lead.survey_electrical_phase] || lead.survey_electrical_phase : "—"} />
          <DoneGroup label="แรงดัน" items={[
            { label: "L-N", value: lead.survey_voltage_ln != null ? `${lead.survey_voltage_ln} V` : "—" },
            { label: "L-L", value: lead.survey_voltage_ll != null ? `${lead.survey_voltage_ll} V` : "—" },
          ]} />
          <DoneRow label="ค่าไฟ/เดือน" value={lead.survey_monthly_bill != null ? `${lead.survey_monthly_bill.toLocaleString()} บาท` : "—"} />
          <DoneGroup label="Consumer Unit / MDB" items={[
            { label: "ยี่ห้อ", value: lead.survey_mdb_brand || "—" },
            { label: "รุ่น", value: lead.survey_mdb_model || "—" },
            { label: "ช่องว่าง", value: lead.survey_mdb_slots ? MDB_SLOTS_MAP[lead.survey_mdb_slots] || lead.survey_mdb_slots : "—" },
          ]} />
          <DoneRow label="ชนิดเบรกเกอร์" value={otherLabel(lead.survey_breaker_type, BREAKER_MAP)} />
          <DoneRow label="ขนาดเมนเบรกเกอร์" value={lead.survey_main_breaker_amp ? `${otherLabel(lead.survey_main_breaker_amp, {})} A` : "—"} />
          <DoneRow label="ขนาดสายเมน" value={lead.survey_main_cable_sqmm ? `${otherLabel(lead.survey_main_cable_sqmm, {})} sq.mm` : "—"} />
          <DoneGroup label="Cable" items={[
            { label: "PV → Inverter", value: lead.survey_panel_to_inverter_m != null ? `${lead.survey_panel_to_inverter_m} m` : "—" },
            { label: "Inverter → MDB", value: lead.survey_db_distance_m != null ? `${lead.survey_db_distance_m} m` : "—" },
          ]} />
          <DoneRow label="เครื่องใช้พิเศษ" value={applianceList.length ? applianceList.join(" · ") : "—"} />
        </div>
      </DoneSection>

      {/* 2. หลังคา · โครงสร้างบ้าน */}
      <DoneSection color="amber" title="หลังคา · โครงสร้างบ้าน">
        <div className="space-y-0.5 text-sm">
          <DoneRow label="จำนวนชั้น" value={lead.survey_floors != null ? `${lead.survey_floors} ชั้น` : "—"} />
          <DoneRow label="วัสดุหลังคา" value={lead.survey_roof_material ? ROOF_MATERIAL_MAP[lead.survey_roof_material] || lead.survey_roof_material : "—"} />
          <DoneRow label="ทิศทางหลังคา" value={lead.survey_roof_orientation ? ORIENTATION_MAP[lead.survey_roof_orientation] || lead.survey_roof_orientation : "—"} />
          <DoneRow label="ความชัน" value={lead.survey_roof_tilt != null ? `${lead.survey_roof_tilt}°` : "—"} />
          <DoneGroup label="ขนาดหลังคา" items={[
            { label: "พื้นที่", value: lead.survey_roof_area_m2 != null ? `${lead.survey_roof_area_m2} m²` : "—" },
            { label: "W × L", value: lead.survey_roof_width_m != null && lead.survey_roof_length_m != null ? `${lead.survey_roof_width_m} × ${lead.survey_roof_length_m} m` : "—" },
          ]} />
          <DoneRow label="โครงสร้างหลังคา" value={lead.survey_roof_structure ? ROOF_STRUCTURE_MAP[lead.survey_roof_structure] || lead.survey_roof_structure : "—"} />
          <DoneRow label="เงาบัง" value={lead.survey_shading ? SHADING_MAP[lead.survey_shading] || lead.survey_shading : "—"} />
        </div>
      </DoneSection>

      {/* 3. การเตรียมการติดตั้ง */}
      <DoneSection color="violet" title="การเตรียมการติดตั้ง">
        <div className="space-y-0.5 text-sm">
          <DoneRow label="ตำแหน่ง Inverter" value={lead.survey_inverter_location ? INVERTER_LOC_MAP[lead.survey_inverter_location] || lead.survey_inverter_location : "—"} />
          <DoneRow label="สัญญาณ Wi-Fi" value={lead.survey_wifi_signal ? WIFI_MAP[lead.survey_wifi_signal] || lead.survey_wifi_signal : "—"} />
          <DoneRow label="วิธีขึ้นหลังคา" value={lead.survey_access_method ? ACCESS_MAP[lead.survey_access_method] || lead.survey_access_method : "—"} />
        </div>
      </DoneSection>

      {/* 4. ขนาดระบบที่เสนอ + packages */}
      <DoneSection color="emerald" title="ขนาดระบบที่เสนอ">
        <div className="space-y-0.5 text-sm">
          <DoneRow label="ขนาดแนะนำ" value={lead.survey_recommended_kw != null ? `${lead.survey_recommended_kw} kWp` : "—"} />
          <DoneRow label="จำนวน Panel" value={lead.survey_panel_count != null ? `${lead.survey_panel_count} แผง` : "—"} />
          <DoneRow label="ระบบ" value={otherLabel(lead.survey_wants_battery, BATTERY_MAP)} />
        </div>
        {selectedPackages.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {selectedPackages.map(pkg => (
              <div key={pkg.id} className="rounded-lg border border-emerald-200 bg-white p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    {pkg.is_upgrade && <span className="text-xxs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase">UPGRADE</span>}
                    {pkg.name}
                  </div>
                  <div className="text-sm font-bold font-mono tabular-nums">{pkg.price.toLocaleString()} ฿</div>
                </div>
                <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-2">
                  <span>{pkg.kwp} kWp</span>
                  {pkg.inverter_kw > 0 && <span>· {pkg.inverter_brand} {pkg.inverter_kw}kW</span>}
                  {pkg.has_battery && <span>· Battery {pkg.battery_kwh}kWh</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </DoneSection>

      {/* 5. บันทึกผู้สำรวจ */}
      {lead.survey_note && (
        <DoneSection color="gray" title="บันทึกผู้สำรวจ">
          <div className="text-sm text-gray-800 whitespace-pre-wrap">{lead.survey_note}</div>
        </DoneSection>
      )}

      {/* 6. ลายเซ็นลูกค้า */}
      {lead.survey_customer_signature_url && (
        <DoneSection color="gray" title="ลายเซ็นลูกค้า">
          <div className="bg-white border border-gray-200 rounded-lg p-3 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lead.survey_customer_signature_url} alt="signature" className="max-h-20 object-contain" />
          </div>
        </DoneSection>
      )}

      {/* 7. Photo Checklist — 4 named slots. Compact 64px thumbnails
          matching the pattern InstallStep uses; click to open gallery. */}
      <DoneSection color="gray" title="รูปตามรายการ">
        <div className="flex flex-wrap gap-1.5">
          {photoSlots.map((p, i) => (
            <div key={p.label} className="flex flex-col items-center gap-0.5">
              <div className="w-16 h-16 rounded border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center">
                {p.url ? (
                  <FallbackImage
                    src={p.url}
                    alt={p.label}
                    className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition"
                    fallbackLabel="—"
                    gallery={photoSlots.filter(x => x.url).map(x => ({ url: x.url!, label: x.label }))}
                    galleryIndex={photoSlots.filter(x => x.url).findIndex(x => x.url === p.url)}
                  />
                ) : (
                  <span className="text-[9px] text-gray-300">—</span>
                )}
              </div>
              <span className="text-[9px] text-gray-500 leading-none">{p.label}</span>
            </div>
          ))}
        </div>
      </DoneSection>

      {/* 8. รูปถ่ายเพิ่มเติม — same 64px thumbnail size. */}
      {lead.survey_photos && (
        <DoneSection color="gray" title="รูปถ่ายเพิ่มเติม">
          <div className="flex flex-wrap gap-1.5">
            {(() => {
              const urls = lead.survey_photos.split(",").filter(Boolean);
              const gallery = urls.map((u, i) => ({ url: u, label: `รูปสำรวจ ${i + 1} / ${urls.length}` }));
              return urls.map((url, idx) => (
                <FallbackImage
                  key={url}
                  src={url}
                  alt="Survey"
                  className="w-16 h-16 object-cover rounded border border-gray-200 hover:opacity-80 transition cursor-pointer"
                  fallbackLabel="รูปหาย"
                  gallery={gallery}
                  galleryIndex={idx}
                />
              ));
            })()}
          </div>
        </DoneSection>
      )}

      {/* PDF download removed — "ใบสำรวจ" button lives in the doneHeader now. */}
    </>);

    return (
      <>
        {pdfPreviewOpen && <SurveyPdfModal leadId={lead.id} onClose={() => setPdfPreviewOpen(false)} />}
        <StepLayout
          state="done"
          doneHeader={doneHeaderContent}
          renderDone={renderDoneContent}
          expanded={expanded}
          onToggle={onToggle}
        />
      </>
    );
  }
  if (state !== "active") return null;

  if (rescheduling) {
    return (
      <AppointmentRescheduler
        title="เลื่อนนัดสำรวจ"
        currentDate={lead.survey_date}
        currentSlot={lead.survey_time_slot}
        showTimeSlot
        excludeLeadId={lead.id}
        teamContext="survey"
        onCancel={() => setRescheduling(false)}
        onSave={saveReschedule}
      />
    );
  }

  const handleSubStepChange = async (i: number) => {
    // Always flush in-flight typed values into DB before switching tabs so a
    // fast click doesn't drop the most recent change (debounce timer hasn't
    // fired yet). Backward jumps still flush — same race exists.
    if (formRef.current) await formRef.current.flushSave();
    if (i <= subStep) { setNextError(null); setSubStep(i); return; }
    const gates: Record<number, string[]> = {
      0: ["survey_confirmed"],
      1: [ // Electrical
        "survey_meter_size", "survey_electrical_phase",
        "survey_voltage_ln", "survey_voltage_ll",
        "survey_monthly_bill",
        "survey_mdb_brand", "survey_mdb_model", "survey_mdb_slots", "survey_breaker_type",
        "survey_panel_to_inverter_m", "survey_db_distance_m",
      ],
      2: [ // Roof / house
        "survey_floors", "survey_roof_material",
        "survey_roof_orientation", "survey_roof_tilt",
        "survey_roof_area_m2", "survey_roof_width_m", "survey_roof_length_m",
        "survey_roof_structure", "survey_shading",
      ],
      3: [ // Install planning + actual visit notes (photos optional)
        "survey_inverter_location", "survey_wifi_signal", "survey_access_method",
        "survey_note",
        "survey_actual_date", "survey_actual_by",
      ],
      4: [ // Recommendation + signature
        "survey_recommended_kw", "survey_panel_count", "survey_wants_battery",
        "interested_package_id", "survey_customer_signature_url",
      ],
      5: [],
    };
    const v = validateSurvey({ ...lead, ...formDraft, survey_note: surveyNote || lead.survey_note, survey_photos: surveyPhotos.length ? surveyPhotos.join(",") : lead.survey_photos, survey_wants_battery: surveyBattery || lead.survey_wants_battery, survey_electrical_phase: surveyPhase || lead.survey_electrical_phase, interested_package_id: selectedPkgs.length ? parseInt(selectedPkgs[0]) : lead.interested_package_id, survey_actual_date: actualDate || lead.survey_actual_date, survey_actual_by: actualBy || lead.survey_actual_by });
    // Validate every step between current and target — jumping ahead by tab click
    // shouldn't skip intermediate gates (e.g. user on subStep 1 jumping to 4 must
    // still satisfy gates 1, 2, 3).
    const requiredFields = new Set<string>();
    for (let s = subStep; s < i; s++) {
      for (const f of gates[s] || []) requiredFields.add(f);
    }
    const missingHere = v.missing.filter(m => requiredFields.has(m.field));
    if (missingHere.length > 0) {
      setNextError(missingHere.map(m => m.label).join(", "));
      return;
    }
    setNextError(null);
    setSubStep(i);
  };

  return (<>
    {pdfPreviewOpen && <SurveyPdfModal leadId={lead.id} onClose={() => setPdfPreviewOpen(false)} />}
    <StepLayout
      state={state}
      subSteps={SURVEY_SUB}
      subStep={subStep}
      onSubStepChange={handleSubStepChange}
      expanded={expanded}
      onToggle={onToggle}
      doneHeader={null}
    >
      {/* Step 1: นัดหมาย */}
      {subStep === 0 && (
        <div className="space-y-3">
          <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${lead.survey_confirmed ? "bg-emerald-50 border-emerald-600/15" : "bg-active-light border-active/20"}`}>
            <svg className={`w-4 h-4 shrink-0 ${lead.survey_confirmed ? "text-emerald-600" : "text-active"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
            </svg>
            <div className="flex-1 flex items-baseline gap-1.5 flex-wrap min-w-0">
              <span className={`text-xs font-semibold tracking-wider uppercase ${lead.survey_confirmed ? "text-emerald-700/70" : "text-active/70"}`}>
                {lead.survey_confirmed ? "ยืนยันแล้ว" : "นัดหมายแล้ว"}
              </span>
              {lead.survey_date && (
                <span className={`text-sm font-bold ${lead.survey_confirmed ? "text-emerald-900" : "text-active"}`}>
                  {formatDate(lead.survey_date)}
                  {slotLabel && <span className="ml-1 font-mono tabular-nums">{slotLabel}</span>}
                </span>
              )}
            </div>
            <button type="button" onClick={() => setRescheduling(true)} className={`shrink-0 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md border transition-colors ${lead.survey_confirmed ? "border-emerald-600/20 text-emerald-700 hover:bg-emerald-100" : "border-active/30 text-active hover:bg-active/10"}`}>
              Reschedule
            </button>
          </div>
          {!lead.survey_confirmed && (
            <div className="space-y-2">
              {lead.line_id && (
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifyLine}
                    onChange={(e) => setNotifyLine(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  <span>ส่งยืนยันนัดหมายทาง LINE</span>
                </label>
              )}
              <button onClick={confirmAppointment} disabled={saving} className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors">
                {saving ? "…" : "ยืนยันนัดหมาย"}
              </button>
            </div>
          )}
          {lead.survey_confirmed && lead.line_id && (
            <button
              type="button"
              onClick={resendAppointmentLine}
              disabled={resending}
              className={`w-full h-8 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                resendResult === "ok" ? "bg-emerald-500 text-white"
                : resendResult === "err" ? "bg-red-500 text-white"
                : "text-gray-700 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {resending ? "กำลังส่ง…"
                : resendResult === "ok" ? "✓ ส่งแล้ว"
                : resendResult === "err" ? "ส่งไม่สำเร็จ"
                : "ส่งยืนยันทาง LINE อีกครั้ง"}
            </button>
          )}

          {/* Site Location (GPS) */}
          {(() => {
            const hasLoc = lead.survey_lat != null && lead.survey_lng != null;
            return (
              <div className={`rounded-xl overflow-hidden border transition-colors ${hasLoc ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200 bg-white"}`}>
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <div className={`w-9 h-8 rounded-lg flex items-center justify-center shrink-0 ${hasLoc ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-400"}`}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xxs font-semibold tracking-wider uppercase text-gray-400 leading-none">พิกัดหน้างาน</div>
                    {hasLoc ? (
                      <div className="font-mono tabular-nums text-sm text-gray-900 mt-1 truncate">
                        {Number(lead.survey_lat).toFixed(6)}, {Number(lead.survey_lng).toFixed(6)}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500 mt-1 leading-snug">กรุณาบันทึกพิกัดบ้านที่ต้องติดตั้ง</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => { setLocEditing(v => !v); setLocError(null); setLocInput(""); }}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-active hover:bg-active/5 transition-colors"
                      title={locEditing ? "ยกเลิก" : "วาง URL พิกัด"}
                      style={{ minHeight: 0 }}
                    >
                      {locEditing ? (
                        <XIcon className="w-4 h-4" strokeWidth={2} />
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                        </svg>
                      )}
                    </button>
                    {hasLoc && (
                      <a
                        href={`https://www.google.com/maps?q=${lead.survey_lat},${lead.survey_lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-primary hover:bg-primary/5 transition-colors"
                        title="เปิด Google Maps"
                        style={{ minHeight: 0 }}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
                {locEditing && (
                  <div className="px-3 pb-2.5 border-t border-gray-200 pt-2.5 space-y-2">
                    <input
                      type="text"
                      value={locInput}
                      onChange={e => setLocInput(e.target.value)}
                      placeholder="วางลิงก์จาก LINE/Google Maps หรือ lat,lng"
                      className="w-full h-11 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-active"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={submitPastedLocation}
                      disabled={locSaving || !locInput.trim()}
                      className="w-full h-8 rounded-lg text-xs font-semibold text-white bg-active hover:brightness-110 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                      style={{ minHeight: 0 }}
                    >
                      {locSaving ? "กำลังบันทึก…" : "บันทึกพิกัดจากลิงก์"}
                    </button>
                  </div>
                )}
                {!locEditing && (
                  <button
                    type="button"
                    onClick={captureLocation}
                    disabled={locSaving}
                    className={`w-full h-8 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 border-t ${hasLoc ? "border-emerald-200 text-emerald-700 hover:bg-emerald-100/50" : "border-gray-200 text-active hover:bg-active/5"} disabled:opacity-50`}
                    style={{ minHeight: 0 }}
                  >
                    {locSaving ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                        กำลังหาตำแหน่ง…
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                        {hasLoc ? "อัปเดตพิกัด" : "บันทึกพิกัด GPS"}
                      </>
                    )}
                  </button>
                )}
                {locError && <div className="px-3 py-1.5 text-xs text-red-600 border-t border-gray-200 bg-red-50/50">{locError}</div>}
              </div>
            );
          })()}
        </div>
      )}

      {/* Step 4: ยืนยัน — ขนาดที่ติดตั้งได้ + แพ็คเกจ */}
      {lead.survey_confirmed && subStep === 4 && (
        <div className="rounded-lg bg-white/60 border border-active/15 p-3 space-y-3">
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">ขนาดที่ติดตั้งได้เหมาะสม (kWp) <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {[3, 5, 7, 10].map(kw => (
                <button
                  key={kw}
                  type="button"
                  onClick={() => {
                    const next = recommendedKw === kw ? null : kw;
                    setRecommendedKw(next);
                    apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ survey_recommended_kw: next }) }).catch(console.error);
                  }}
                  className={`h-8 rounded-lg text-sm font-semibold border transition-all ${recommendedKw === kw ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200"}`}
                >
                  {kw} kWp
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">ระบบ <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {[
                { value: "no",        label: "On Grid" },
                { value: "yes",       label: "Solar+Battery" },
                { value: "upgrade",   label: "+ Upgrade" },
                { value: "customize", label: "Customize" },
              ].map(b => (
                <button key={b.value} type="button" onClick={() => {
                  setSurveyBattery(b.value);
                  setSelectedPkgs([]);
                  // Customize tab has its own per-item counts → clear the
                  // standalone survey_panel_count so it doesn't double-show.
                  const patchBody: Record<string, unknown> = {
                    survey_wants_battery: b.value,
                    interested_package_ids: null,
                    interested_package_id: null,
                  };
                  if (b.value === "customize") {
                    setPanelCount("");
                    patchBody.survey_panel_count = null;
                  }
                  apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patchBody) }).catch(console.error);
                }} className={`h-8 rounded-lg text-xs font-semibold border transition-all ${surveyBattery === b.value ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200"}`}>
                  {b.label}
                </button>
              ))}
            </div>
            {(surveyBattery === "customize" || surveyBattery.startsWith("customize:")) && (
              <div className="mt-3 space-y-2">
                {([
                  { key: "panel",    label: "Panel" },
                  { key: "battery",  label: "Battery" },
                  { key: "inverter", label: "Inverter" },
                ] as const).map(({ key, label }) => {
                  const count = customizeData[key];
                  return (
                    <div key={key} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                      <span className="flex-1 text-sm text-gray-700">{label}</span>
                      <button
                        type="button"
                        onClick={() => patchCustomizeData({ ...customizeData, [key]: Math.max(0, count - 1) })}
                        className="w-7 h-7 rounded-md border border-gray-200 text-gray-700 font-bold shrink-0 hover:border-active hover:text-active flex items-center justify-center"
                      >−</button>
                      <span className="w-6 text-center text-sm font-mono tabular-nums shrink-0">{count}</span>
                      <button
                        type="button"
                        onClick={() => patchCustomizeData({ ...customizeData, [key]: count + 1 })}
                        className="w-7 h-7 rounded-md border border-gray-200 text-gray-700 font-bold shrink-0 hover:border-active hover:text-active flex items-center justify-center"
                      >+</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Customize tab = custom system, skip the predefined package picker
              + panel count + note. They render only for the other 3 tabs. */}
          {!surveyBattery.startsWith("customize") && (
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Package ที่เหมาะสม</div>
          )}
          {!surveyBattery.startsWith("customize") && (() => {
            // Filter by kWp size ONLY — the system-type chip below is a
            // preference marker, not a filter. Catalog is small enough
            // that surveyors prefer seeing every package at the picked
            // size and choosing the best fit themselves. Sort so upgrade
            // packages sink to the bottom of the list (they're a niche
            // add-on, not the primary offer).
            const availablePkgs = packages
              .filter(p => recommendedKw != null ? p.kwp === recommendedKw : true)
              .slice()
              .sort((a, b) => Number(a.is_upgrade) - Number(b.is_upgrade));
            return availablePkgs.length > 0 ? (
              // 7-col grid · each package card md:col-span-2 → 3 cards per row
              // on desktop. Matches the PreSurveyForm package picker layout.
              <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
                {availablePkgs.map(p => {
                  const idStr = String(p.id);
                  const selected = selectedPkgs.includes(idStr);
                  return (
                    <button key={p.id} type="button" onClick={() => {
                      const next = selected
                        ? selectedPkgs.filter(x => x !== idStr)
                        : selectedPkgs.length >= MAX_PKGS ? selectedPkgs : [...selectedPkgs, idStr];
                      setSelectedPkgs(next);
                      apiFetch(`/api/leads/${lead.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          interested_package_ids: next.length ? next.join(",") : null,
                          interested_package_id: next.length ? parseInt(next[0]) : null,
                        }),
                      }).catch(console.error);
                    }} className={`md:col-span-2 text-left rounded-xl p-3 border-2 transition-all ${selected ? "border-active bg-active-light" : "border-gray-100 bg-white"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate flex items-center gap-1.5">
                            {p.is_upgrade && <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase shrink-0">UPGRADE</span>}
                            {p.name}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                            {p.inverter_brand && <span>{p.inverter_brand} {p.inverter_kw}kW</span>}
                            {p.has_battery && <span>Battery {p.battery_kwh}kWh</span>}
                            {p.is_upgrade && !p.has_panel && <span>เพิ่มแบตอย่างเดียว</span>}
                            <span className="inline-flex items-center gap-0.5 ml-1">
                              <svg className={`w-3.5 h-3.5 ${p.has_panel ? "text-amber-500" : "text-gray-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
                              <BoltIcon className={`w-3.5 h-3.5 ${p.has_inverter ? "text-violet-500" : "text-gray-300"}`} strokeWidth={2} />
                              <svg className={`w-3.5 h-3.5 ${p.has_battery ? "text-green-500 fill-green-500" : "text-gray-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 10.5h.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H21M3.75 18h15A2.25 2.25 0 0021 15.75v-6a2.25 2.25 0 00-2.25-2.25h-15A2.25 2.25 0 001.5 9.75v6A2.25 2.25 0 003.75 18z" /></svg>
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold font-mono tabular-nums">{p.price.toLocaleString()}</div>
                          <div className="text-xs text-gray-400">THB</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : <div className="text-center py-6 text-xs text-gray-400">ไม่มีแพ็คเกจ</div>;
          })()}

          {/* Panel count — non-customize tabs only (customize has its own Panel
              row inside the stepper list above). */}
          {!surveyBattery.startsWith("customize") && (
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">จำนวน Panel <span className="text-red-500">*</span></div>
              <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                <div className="col-span-1">
                  <NumberStepper
                    value={panelCount === "" ? null : panelCount}
                    onChange={v => {
                      const next = v == null ? "" : v;
                      setPanelCount(next);
                      apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ survey_panel_count: typeof next === "number" ? next : null }) }).catch(console.error);
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg bg-white/60 border border-active/15 p-3">
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">
              {surveyBattery.startsWith("customize") ? "อื่นๆ" : "บันทึกเกี่ยวกับแพ็คเกจ"}
              {surveyBattery.startsWith("customize") && <span className="ml-1 text-red-500">*</span>}
            </label>
            <textarea
              value={packageNote}
              onChange={e => setPackageNote(e.target.value)}
              placeholder={surveyBattery.startsWith("customize") ? "ระบุรายการเพิ่มเติม..." : "หมายเหตุเพิ่มเติม เช่น เพิ่ม panel, แบต option, ส่วนลดพิเศษ..."}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary resize-none"
            />
          </div>

          {/* Quotation type — drives whether OrderStep uses the standard
              template or routes to a special-pricing flow. Saved to lead
              immediately on click so it survives a refresh. */}
          <div className="rounded-lg bg-white/60 border border-active/15 p-3">
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">ประเภทใบเสนอราคา</label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {[
                { value: "standard", label: "Standard" },
                { value: "special", label: "Customization" },
              ].map(opt => {
                const active = quotationType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setQuotationType(opt.value);
                      apiFetch(`/api/leads/${lead.id}`, {
                        method: "PATCH", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ quotation_type: opt.value }),
                      }).catch(console.error);
                    }}
                    className={`h-8 rounded-lg text-sm font-semibold border transition-all ${active ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200 hover:border-active/50"}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ลายเซ็นลูกค้า */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">ลายเซ็นลูกค้า <span className="text-red-500">*</span></div>
            <SignaturePad
              leadId={lead.id}
              fieldName="survey_customer_signature_url"
              initialUrl={lead.survey_customer_signature_url}
              onSaved={(url) => {
                setSignatureUrl(url);
                // Keep the page-level lead snapshot current so switching away
                // from Workflow and back remounts the saved signature.
                if (url) void refresh();
              }}
            />
          </div>

          {/* การสำรวจหน้างาน — วันและผู้สำรวจจริง · each input md:col-span-3 in
              the 7-col grid (matches the ยืนยัน substep on PreSurvey side). */}
          {/* การสำรวจหน้างาน + PDF preview + LINE notify — single 7-col row on
              desktop: วันที่ (2) + ผู้สำรวจ (2) + ดูใบสำรวจ (2) + LINE (1).
              `items-end` so the chip-less button/checkbox align with the input
              row, not with the labels above the inputs. Mobile stacks. */}
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
            <div className="col-span-2 md:col-span-2 flex flex-col gap-1">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">วันที่เข้าสำรวจจริง <span className="text-red-500">*</span></div>
              <input type="date" value={actualDate} onChange={e => setActualDate(e.target.value)}
                className="w-full h-8 px-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary" />
            </div>
            <div className="col-span-2 md:col-span-2 flex flex-col gap-1">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">ผู้เข้าสำรวจ <span className="text-red-500">*</span></div>
              <input type="text" value={actualBy} onChange={e => setActualBy(e.target.value)}
                className="w-full h-8 px-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary" />
            </div>
            <button
              type="button"
              onClick={openPdf}
              className="col-span-2 md:col-span-1 h-8 px-2 rounded-lg text-sm font-semibold border border-gray-200 bg-white text-gray-700 hover:border-active hover:text-active hover:bg-active/5 transition-colors inline-flex items-center justify-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              ดูใบสำรวจ
            </button>
            {lead.line_id && (
              <label className="col-span-2 md:col-span-1 h-8 flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyDoneLine}
                  onChange={(e) => setNotifyDoneLine(e.target.checked)}
                  className="w-4 h-4 accent-primary shrink-0"
                />
                <span>ส่ง LINE</span>
              </label>
            )}
          </div>

          {/* Confirm — สำรวจเสร็จสิ้น (paired with ย้อนกลับ in nav row below) */}
          <div className="flex gap-2 mt-3 md:justify-between">
            <button type="button" onClick={() => { setSubStep(subStep - 1); setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100); }} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
              <ChevronLeftIcon className="w-4 h-4" strokeWidth={2} />
              ย้อนกลับ
            </button>
            <button onClick={markDone} disabled={saving || !signatureUrl} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
              <CheckIcon className="w-4 h-4" strokeWidth={2.5} />
              {saving ? "กำลังบันทึก…" : "สำรวจเสร็จสิ้น"}
            </button>
          </div>
        </div>
      )}

      {/* Step 1: ระบบไฟฟ้า (PDF section 2) */}
      {lead.survey_confirmed && subStep === 1 && (
        <SurveyForm ref={formRef} lead={lead} refresh={refresh} section="electrical" onFormChange={setFormDraft} onPhaseChange={(phase) => { setSurveyPhase(phase); setSelectedPkgs([]); apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interested_package_ids: null, interested_package_id: null }) }).catch(console.error); }} />
      )}

      {/* Step 2: หลังคา · บ้าน (PDF section 3) */}
      {lead.survey_confirmed && subStep === 2 && (
        <SurveyForm ref={formRef} lead={lead} refresh={refresh} section="house" onFormChange={setFormDraft} />
      )}

      {/* Step 3: การเตรียมการติดตั้ง + บันทึก + รูปถ่าย */}
      {lead.survey_confirmed && subStep === 3 && (
        <div className="space-y-3">
          <SurveyForm ref={formRef} lead={lead} refresh={refresh} section="prep" onFormChange={setFormDraft} />
          <div className="rounded-lg bg-white/60 border border-active/15 p-3">
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">บันทึก Survey <span className="text-red-500">*</span></label>
            <textarea value={surveyNote} onChange={e => setSurveyNote(e.target.value)} placeholder="บันทึกหน้างาน เช่น สภาพหลังคา, ข้อจำกัด, ข้อแนะนำ..." rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary resize-none" />
          </div>
          <div className="rounded-lg bg-white/60 border border-active/15 p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold tracking-wider uppercase text-gray-400">รูปถ่ายเพิ่มเติม</label>
              {surveyPhotos.length > 0 && <span className="text-xs text-gray-500">{surveyPhotos.length} รูป</span>}
            </div>
            {/* Two inputs feed the same handler — capture=environment opens
                 the camera, the bare one opens the gallery (multiple lets the
                 user grab a batch). UI surfaces both as icon-only buttons. */}
            <input type="file" accept="image/*" capture="environment" onChange={handlePhotoCapture} className="hidden" id={`survey-photos-cam-${lead.id}`} />
            <input type="file" accept="image/*" multiple onChange={handlePhotoCapture} className="hidden" id={`survey-photos-lib-${lead.id}`} />
            {/* Single drop zone with the thumbs + add tile inline. Camera
                shortcut sits as a small icon next to the "+" tile so surveyors
                in the field still get the quick capture path. */}
            {/* Empty → big centered prompt. Filled → grid + small "+" tile.
                Camera shortcut sits inside both states for surveyors. */}
            <div
              onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setPhotoDragActive(true); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!photoDragActive) setPhotoDragActive(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setPhotoDragActive(false); }}
              onDrop={async (e) => {
                e.preventDefault(); e.stopPropagation();
                setPhotoDragActive(false);
                const dropped = Array.from(e.dataTransfer.files || []).filter(f => f.type.startsWith("image/"));
                if (dropped.length) await uploadFiles(dropped);
              }}
              className={`relative rounded-lg border-2 border-dashed transition-colors ${photoDragActive ? "border-primary bg-primary/5" : "border-gray-300 bg-white"}`}
            >
              {surveyPhotos.length === 0 ? (
                <label
                  htmlFor={`survey-photos-lib-${lead.id}`}
                  className={`flex flex-col items-center justify-center gap-2 px-4 py-12 min-h-[160px] cursor-pointer transition-colors ${photoDragActive ? "text-primary" : "text-gray-500 hover:text-primary"}`}
                >
                  {photoUploading ? (
                    <div className="w-8 h-8 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  ) : (
                    <>
                      <svg className="w-10 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" /></svg>
                      <span className="text-sm font-semibold">
                        {photoDragActive ? "ปล่อยเพื่ออัพโหลด" : "ลากรูปมาวาง หรือคลิกเพื่อเลือก"}
                      </span>
                    </>
                  )}
                </label>
              ) : (
                <div className="p-3 grid grid-cols-2 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {surveyPhotos.map((url, idx) => (
                    <div key={url} className="relative aspect-square">
                      <FallbackImage
                        src={url}
                        alt="Survey"
                        className="w-full h-full object-cover rounded-lg border border-gray-200"
                        gallery={surveyPhotos.map((u, i) => ({ url: u, label: `รูปสำรวจ ${i + 1} / ${surveyPhotos.length}` }))}
                        galleryIndex={idx}
                      />
                      <button type="button" onClick={() => removePhoto(url)} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shadow">×</button>
                    </div>
                  ))}
                  <label
                    htmlFor={`survey-photos-lib-${lead.id}`}
                    title="เพิ่มรูป"
                    className={`relative aspect-square flex items-center justify-center rounded-lg border-2 border-dashed cursor-pointer transition-colors ${photoDragActive ? "border-primary text-primary" : "border-gray-300 text-gray-400 hover:border-primary hover:text-primary"}`}
                  >
                    {photoUploading ? (
                      <div className="w-6 h-6 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    ) : (
                      <PlusIcon className="w-8 h-8" strokeWidth={1.5} />
                    )}
                  </label>
                </div>
              )}
              {/* Camera shortcut — pinned to the box corner; works in both
                  empty and filled states. capture=environment opens the phone
                  camera directly. */}
              {!photoUploading && (
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); document.getElementById(`survey-photos-cam-${lead.id}`)?.click(); }}
                  title="ถ่ายรูปจากกล้อง"
                  className="absolute top-2 right-2 w-8 h-8 rounded-md bg-white border border-gray-200 text-gray-500 hover:text-active hover:border-active flex items-center justify-center shadow-sm transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      {lead.survey_confirmed && subStep < 4 && (() => {
        // Keep this dict in sync with the gates in handleSubStepChange above —
        // both should enforce the same required fields per sub-step.
        const gates: Record<number, string[]> = {
          0: ["survey_confirmed"],
          1: [
            "survey_meter_size", "survey_electrical_phase",
            "survey_voltage_ln", "survey_voltage_ll",
            "survey_monthly_bill",
            "survey_mdb_brand", "survey_mdb_model", "survey_mdb_slots", "survey_breaker_type",
            "survey_panel_to_inverter_m", "survey_db_distance_m",
            "survey_appliances",
          ],
          2: [
            "survey_floors", "survey_roof_material",
            "survey_roof_orientation", "survey_roof_tilt",
            "survey_roof_area_m2", "survey_roof_width_m", "survey_roof_length_m",
            "survey_roof_structure", "survey_shading",
          ],
          3: [
            "survey_inverter_location", "survey_wifi_signal", "survey_access_method",
            "survey_note",
            "survey_actual_date", "survey_actual_by",
          ],
        };
        const handleNext = async () => {
          const v = validateSurvey({ ...lead, ...formDraft, survey_note: surveyNote || lead.survey_note, survey_photos: surveyPhotos.length ? surveyPhotos.join(",") : lead.survey_photos, survey_wants_battery: surveyBattery || lead.survey_wants_battery, survey_electrical_phase: surveyPhase || lead.survey_electrical_phase, interested_package_id: selectedPkgs.length ? parseInt(selectedPkgs[0]) : lead.interested_package_id, survey_actual_date: actualDate || lead.survey_actual_date, survey_actual_by: actualBy || lead.survey_actual_by });
          const missingHere = v.missing.filter(m => (gates[subStep] || []).includes(m.field));
          if (missingHere.length > 0) {
            setNextError(missingHere.map(m => m.label).join(", "));
            return;
          }
          if (formRef.current) await formRef.current.flushSave();
          setNextError(null);
          setSubStep(subStep + 1);
          setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
        };
        return (
          <div className="flex gap-2 mt-3 md:justify-between">
            {subStep > 0 ? (
              <button type="button" onClick={() => { setNextError(null); setSubStep(subStep - 1); setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100); }} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
                <ChevronLeftIcon className="w-4 h-4" strokeWidth={2} />
                ย้อนกลับ
              </button>
            ) : <span className="hidden md:block md:w-64" />}
            <button type="button" onClick={handleNext} className="flex-1 md:flex-none md:w-64 h-11 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 transition-colors flex items-center justify-center gap-1">
              ถัดไป
              <ChevronRightIcon className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        );
      })()}
      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
    </StepLayout>
  </>);
}

// Mobile keeps the "label left / value right" layout (justify-between +
// text-right). Desktop switches to "label 40 wide, value flowing right
// after" — matches PreSurvey's DataRow so both step-done views feel like
// one system instead of one column-aligned, one right-aligned.
function DoneRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline gap-2 justify-between lg:justify-start">
      <span className="text-xs text-gray-400 shrink-0 lg:w-40">{label}</span>
      <span className="font-semibold text-gray-800 min-w-0 text-right lg:text-left">{value}</span>
    </div>
  );
}

function DoneGroup({ label, items }: { label: string; items: { label: string; value: string }[] }) {
  return (
    <div className="flex items-baseline gap-2 justify-between lg:justify-start">
      <span className="text-xs text-gray-400 shrink-0 lg:w-40">{label}</span>
      <div className="text-right lg:text-left flex flex-wrap items-baseline justify-end lg:justify-start gap-x-3 gap-y-0.5">
        {items.map((it, i) => (
          <span key={i} className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-xs text-gray-400">{it.label}</span>
            <span className="font-semibold text-gray-800">{it.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
