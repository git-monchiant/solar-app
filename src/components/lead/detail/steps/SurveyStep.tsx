"use client";

import { useEffect, useState } from "react";
import { apiFetch, getUserIdHeader } from "@/lib/api";
import type { StepCommonProps, Package, Lead } from "./types";
import SurveyForm from "./SurveyForm";
import AppointmentRescheduler from "@/components/calendar/AppointmentRescheduler";
import ErrorPopup from "@/components/ui/ErrorPopup";
import { validateSurvey } from "@/lib/constants/step-validators";
import FallbackImage from "@/components/ui/FallbackImage";
import StepLayout from "../StepLayout";
import SignaturePad from "../SignaturePad";
import SurveyPdfModal from "../SurveyPdfModal";
import { useSubStep } from "@/lib/hooks/useSubStep";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { compressImage } from "@/lib/utils/compressImage";
import { buildAppointmentFlex } from "@/lib/utils/line-flex";

const formatDate = (d: string) =>
  new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

const SURVEY_TIME_SLOTS = [
  { value: "morning", label: "เช้า", time: "09:00 - 12:00" },
  { value: "afternoon", label: "บ่าย", time: "13:00 - 16:00" },
];

const ROOF_MATERIAL_MAP: Record<string, string> = {
  cpac_tile: "CPAC", old_tile: "ลอนคู่",
  "metal_sheet:bolt": "เมทัลชีท ยึดน็อต", "metal_sheet:clip": "เมทัลชีท คลิปล็อก",
  concrete: "ดาดฟ้าคอนกรีต",
};
const ORIENTATION_MAP: Record<string, string> = { north: "เหนือ", south: "ใต้", east: "ตะวันออก", west: "ตะวันตก" };
const SHADING_MAP: Record<string, string> = { none: "ไม่มี", partial: "บางช่วง", heavy: "ตลอดวัน" };
const METER_MAP: Record<string, string> = { "5_15": "5(15) A", "15_45": "15(45) A", "30_100": "30(100) A" };
const MDB_SLOTS_MAP: Record<string, string> = { has_slot: "มีช่องว่าง", full: "เต็ม" };
const BREAKER_MAP: Record<string, string> = { plug_on: "Plug On", screw: "ขันยึดสกรู" };
const ROOF_STRUCTURE_MAP: Record<string, string> = { steel: "เหล็ก", wood: "ไม้", aluminum: "อลูมิเนียม" };
const INVERTER_LOC_MAP: Record<string, string> = { indoor: "ในร่ม", outdoor: "นอกอาคาร" };
const WIFI_MAP: Record<string, string> = { good: "ดีมาก", fair: "พอใช้", none: "ยังไม่มี" };
const ACCESS_MAP: Record<string, string> = { ladder: "บันไดพาด", scaffold: "นั่งร้าน", crane: "รถกระเช้า" };
const APPLIANCE_MAP: Record<string, string> = { water_heater: "เครื่องทำน้ำอุ่น", ev: "ที่ชาร์จรถ EV" };
const BATTERY_MAP: Record<string, string> = { yes: "Solar + Battery", no: "On Grid", upgrade: "Upgrade", maybe: "ยังไม่แน่ใจ" };
const PHASE_MAP: Record<string, string> = { "1_phase": "1 เฟส", "3_phase": "3 เฟส" };

function otherLabel(raw: string | null, map: Record<string, string>): string {
  if (!raw) return "—";
  if (raw.startsWith("other:")) return raw.slice(6) || "อื่นๆ";
  return map[raw] || raw;
}
const AC_BTU_SIZES = [9000, 12000, 18000, 24000];

function parseAcUnits(s: string | null): Record<number, number> {
  const map: Record<number, number> = {};
  AC_BTU_SIZES.forEach(b => { map[b] = 0; });
  if (!s) return map;
  s.split(",").forEach(pair => {
    const [bStr, cStr] = pair.split(":");
    const btu = parseInt(bStr); const count = parseInt(cStr);
    if (!isNaN(btu) && !isNaN(count) && AC_BTU_SIZES.includes(btu)) map[btu] = count;
  });
  return map;
}

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
  const [selectedPkgs, setSelectedPkgs] = useState<string[]>(
    lead.interested_package_ids ? lead.interested_package_ids.split(",").filter(Boolean) : lead.interested_package_id ? [String(lead.interested_package_id)] : []
  );
  const MAX_PKGS = 3;
  const [surveyBattery, setSurveyBattery] = useState<string>(lead.survey_wants_battery ?? lead.pre_wants_battery ?? "");
  const [recommendedKw, setRecommendedKw] = useState<number | null>(lead.survey_recommended_kw ?? null);
  const [panelCount, setPanelCount] = useState<number | "">(lead.survey_panel_count ?? "");
  const [surveyPhase, setSurveyPhase] = useState<string>(lead.survey_electrical_phase ?? lead.pre_electrical_phase ?? "");
  const [rescheduling, setRescheduling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [surveyNote, setSurveyNote] = useState<string>(lead.survey_note ?? "");
  const [surveyPhotos, setSurveyPhotos] = useState<string[]>(lead.survey_photos ? lead.survey_photos.split(",").filter(Boolean) : []);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const isMobile = useIsMobile();
  // Mobile → in-app modal preview. Desktop → new tab (native PDF viewer).
  const openPdf = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isMobile) setPdfPreviewOpen(true);
    else window.open(`/api/survey/${lead.id}`, "_blank", "noreferrer");
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



  const slotLabel = SURVEY_TIME_SLOTS.find(s => s.value === lead.survey_time_slot)?.time ?? lead.survey_time_slot;

  const persistPhotos = async (next: string[]) => {
    setSurveyPhotos(next);
    await apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ survey_photos: next.length ? next.join(",") : null }),
    });
    refresh();
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
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
      e.target.value = "";
    }
  };

  const removePhoto = async (url: string) => {
    fetch(`/api/upload?file=${encodeURIComponent(url)}`, {
      method: "DELETE",
      headers: { "ngrok-skip-browser-warning": "true", ...getUserIdHeader() },
    }).catch(() => {});
    await persistPhotos(surveyPhotos.filter(u => u !== url));
  };

  const [notifyLine, setNotifyLine] = useState(true);
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
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "quote" }),
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const slotTime = SURVEY_TIME_SLOTS.find(s => s.value === lead.survey_time_slot)?.time;

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
        className="mr-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dark shrink-0"
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
      { url: lead.survey_photo_mdb_url, label: "ตู้ MDB" },
      { url: lead.survey_photo_inverter_point_url, label: "จุด Inverter" },
    ];

    const renderDoneContent = () => (<>

      {/* 1. ระบบไฟฟ้า */}
      <div className="border-l-3 border-blue-400 pl-3">
        <div className="text-xs font-bold text-blue-600 uppercase mb-1.5">ระบบไฟฟ้า</div>
        <div className="space-y-0.5 text-sm">
          <DoneRow label="มิเตอร์" value={lead.survey_meter_size ? METER_MAP[lead.survey_meter_size] || lead.survey_meter_size : "—"} />
          <DoneRow label="ระบบไฟ" value={lead.survey_electrical_phase ? PHASE_MAP[lead.survey_electrical_phase] || lead.survey_electrical_phase : "—"} />
          <DoneGroup label="แรงดัน" items={[
            { label: "L-N", value: lead.survey_voltage_ln != null ? `${lead.survey_voltage_ln} V` : "—" },
            { label: "L-L", value: lead.survey_voltage_ll != null ? `${lead.survey_voltage_ll} V` : "—" },
          ]} />
          <DoneRow label="ค่าไฟ/เดือน" value={lead.survey_monthly_bill != null ? `${lead.survey_monthly_bill.toLocaleString()} บาท` : "—"} />
          <DoneGroup label="ตู้ MDB" items={[
            { label: "ยี่ห้อ", value: lead.survey_mdb_brand || "—" },
            { label: "รุ่น", value: lead.survey_mdb_model || "—" },
            { label: "ช่องว่าง", value: lead.survey_mdb_slots ? MDB_SLOTS_MAP[lead.survey_mdb_slots] || lead.survey_mdb_slots : "—" },
          ]} />
          <DoneRow label="ชนิดเบรกเกอร์" value={otherLabel(lead.survey_breaker_type, BREAKER_MAP)} />
          <DoneGroup label="Cable" items={[
            { label: "PV → Inverter", value: lead.survey_panel_to_inverter_m != null ? `${lead.survey_panel_to_inverter_m} m` : "—" },
            { label: "Inverter → MDB", value: lead.survey_db_distance_m != null ? `${lead.survey_db_distance_m} m` : "—" },
          ]} />
          <DoneRow label="เครื่องใช้พิเศษ" value={applianceList.length ? applianceList.join(" · ") : "—"} />
        </div>
      </div>

      {/* 2. หลังคา · โครงสร้างบ้าน */}
      <div className="border-l-3 border-amber-400 pl-3">
        <div className="text-xs font-bold text-amber-600 uppercase mb-1.5">หลังคา · โครงสร้างบ้าน</div>
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
      </div>

      {/* 3. การเตรียมการติดตั้ง */}
      <div className="border-l-3 border-violet-400 pl-3">
        <div className="text-xs font-bold text-violet-600 uppercase mb-1.5">การเตรียมการติดตั้ง</div>
        <div className="space-y-0.5 text-sm">
          <DoneRow label="ตำแหน่ง Inverter" value={lead.survey_inverter_location ? INVERTER_LOC_MAP[lead.survey_inverter_location] || lead.survey_inverter_location : "—"} />
          <DoneRow label="สัญญาณ Wi-Fi" value={lead.survey_wifi_signal ? WIFI_MAP[lead.survey_wifi_signal] || lead.survey_wifi_signal : "—"} />
          <DoneRow label="วิธีขึ้นหลังคา" value={lead.survey_access_method ? ACCESS_MAP[lead.survey_access_method] || lead.survey_access_method : "—"} />
        </div>
      </div>

      {/* 4. ขนาดระบบที่เสนอ + packages */}
      <div className="border-l-3 border-emerald-400 pl-3">
        <div className="text-xs font-bold text-emerald-600 uppercase mb-1.5">ขนาดระบบที่เสนอ</div>
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
                    {pkg.is_upgrade && <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase">UPGRADE</span>}
                    {pkg.name}
                  </div>
                  <div className="text-sm font-bold font-mono tabular-nums">{pkg.price.toLocaleString()} ฿</div>
                </div>
                <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-2">
                  <span>{pkg.kwp} kWp</span>
                  {pkg.solar_panels > 0 && <span>· {pkg.solar_panels} × {pkg.panel_watt}W</span>}
                  {pkg.inverter_kw > 0 && <span>· {pkg.inverter_brand} {pkg.inverter_kw}kW</span>}
                  {pkg.has_battery && <span>· Battery {pkg.battery_kwh}kWh</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. บันทึกผู้สำรวจ */}
      {lead.survey_note && (
        <div className="border-l-3 border-gray-300 pl-3">
          <div className="text-xs font-bold text-gray-500 uppercase mb-1.5">บันทึกผู้สำรวจ</div>
          <div className="text-sm text-gray-800 whitespace-pre-wrap">{lead.survey_note}</div>
        </div>
      )}

      {/* 6. ลายเซ็นลูกค้า */}
      {lead.survey_customer_signature_url && (
        <div className="border-l-3 border-gray-300 pl-3">
          <div className="text-xs font-bold text-gray-500 uppercase mb-1.5">ลายเซ็นลูกค้า</div>
          <div className="bg-white border border-gray-200 rounded-lg p-3 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lead.survey_customer_signature_url} alt="signature" className="max-h-20 object-contain" />
          </div>
        </div>
      )}

      {/* 7. Photo Checklist — 4 named slots */}
      <div className="border-l-3 border-gray-300 pl-3">
        <div className="text-xs font-bold text-gray-500 uppercase mb-1.5">Photo Checklist</div>
        <div className="grid grid-cols-2 gap-2">
          {photoSlots.map(p => (
            <div key={p.label} className="rounded-lg overflow-hidden border border-gray-200 bg-white">
              <div className="aspect-[4/3] bg-gray-50 flex items-center justify-center overflow-hidden">
                {p.url ? (
                  <FallbackImage src={p.url} alt={p.label} className="w-full h-full object-cover" fallbackLabel="รูปหาย" />
                ) : (
                  <span className="text-[10px] text-gray-300">— ไม่มีรูป —</span>
                )}
              </div>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 text-center">{p.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 8. รูปถ่ายเพิ่มเติม */}
      {lead.survey_photos && (
        <div className="border-l-3 border-gray-300 pl-3">
          <div className="text-xs font-bold text-gray-500 uppercase mb-1.5">รูปถ่ายเพิ่มเติม</div>
          <div className="grid grid-cols-3 gap-2">
            {(() => {
              const urls = lead.survey_photos.split(",").filter(Boolean);
              const gallery = urls.map((u, i) => ({ url: u, label: `รูปสำรวจ ${i + 1} / ${urls.length}` }));
              return urls.map((url, idx) => (
                <FallbackImage
                  key={url}
                  src={url}
                  alt="Survey"
                  className="w-full aspect-square object-cover rounded-lg border border-gray-200"
                  fallbackLabel="รูปหาย"
                  gallery={gallery}
                  galleryIndex={idx}
                />
              ));
            })()}
          </div>
        </div>
      )}

      {/* PDF download */}
      <button
        type="button"
        onClick={openPdf}
        className="flex items-center justify-center gap-2 w-full h-11 rounded-lg bg-primary hover:bg-primary-dark text-sm font-semibold text-white transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        ใบสำรวจหน้างาน (PDF)
      </button>
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
        timeSlots={SURVEY_TIME_SLOTS.map(s => ({ value: s.value, label: s.label, time: s.time }))}
        excludeLeadId={lead.id}
        onCancel={() => setRescheduling(false)}
        onSave={saveReschedule}
      />
    );
  }

  const handleSubStepChange = (i: number) => {
    if (i <= subStep) { setNextError(null); setSubStep(i); return; }
    const gates: Record<number, string[]> = {
      0: ["survey_confirmed"],
      // All other steps unblocked while the PDF layout is being iterated.
      1: [], 2: [], 3: [], 4: [], 5: [],
    };
    const v = validateSurvey({ ...lead, ...formDraft, survey_note: surveyNote || lead.survey_note, survey_photos: surveyPhotos.length ? surveyPhotos.join(",") : lead.survey_photos, survey_wants_battery: surveyBattery || lead.survey_wants_battery, survey_electrical_phase: surveyPhase || lead.survey_electrical_phase, interested_package_id: selectedPkgs.length ? parseInt(selectedPkgs[0]) : lead.interested_package_id });
    const missingHere = v.missing.filter(m => (gates[subStep] || []).includes(m.field));
    if (missingHere.length > 0) {
      setNextError(missingHere.map(m => m.label).join(", "));
      return;
    }
    setNextError(null);
    setSubStep(i);
  };

  return (
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
              className={`w-full h-10 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
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
        </div>
      )}

      {/* Step 4: ยืนยัน — ขนาดที่ติดตั้งได้ + แพ็คเกจ */}
      {lead.survey_confirmed && subStep === 4 && (
        <div className="rounded-lg bg-white/60 border border-active/15 p-3 space-y-3">
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">ขนาดที่ติดตั้งได้เหมาะสม (kWp)</div>
            <div className="grid grid-cols-4 gap-2">
              {[3, 5, 7, 10].map(kw => (
                <button
                  key={kw}
                  type="button"
                  onClick={() => {
                    const next = recommendedKw === kw ? null : kw;
                    setRecommendedKw(next);
                    apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ survey_recommended_kw: next }) }).catch(console.error);
                  }}
                  className={`h-9 rounded-lg text-sm font-semibold border transition-all ${recommendedKw === kw ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200"}`}
                >
                  {kw} kWp
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">ระบบ</div>
            <div className="grid grid-cols-2 gap-2">
              {[{ value: "no", label: "On Grid" }, { value: "yes", label: "Solar+Battery" }, { value: "upgrade", label: "+ Upgrade" }].map(b => (
                <button key={b.value} type="button" onClick={() => {
                  setSurveyBattery(b.value);
                  setSelectedPkgs([]);
                  apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ survey_wants_battery: b.value, interested_package_ids: null, interested_package_id: null }) }).catch(console.error);
                }} className={`h-9 rounded-lg text-xs font-semibold border transition-all ${surveyBattery === b.value ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200"}`}>
                  {b.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="อื่นๆ ระบุ..."
              value={surveyBattery.startsWith("other:") ? surveyBattery.slice(6) : ""}
              onChange={e => {
                const v = e.target.value ? `other:${e.target.value}` : "";
                setSurveyBattery(v);
                setSelectedPkgs([]);
                apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ survey_wants_battery: v || null, interested_package_ids: null, interested_package_id: null }) }).catch(console.error);
              }}
              onFocus={() => { if (!surveyBattery.startsWith("other")) setSurveyBattery("other:"); }}
              className={`w-full mt-2 h-10 px-3 rounded-lg border text-sm focus:outline-none ${surveyBattery.startsWith("other") ? "border-active bg-active-light" : "border-gray-200 bg-white"}`}
            />
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">จำนวน Panel</div>
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                value={panelCount === "" ? "" : panelCount}
                onChange={e => {
                  const v = e.target.value ? parseInt(e.target.value) : "";
                  setPanelCount(v);
                  apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ survey_panel_count: typeof v === "number" ? v : null }) }).catch(console.error);
                }}
                placeholder="เช่น 10"
                className="w-full h-10 pl-3 pr-14 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium pointer-events-none">แผง</span>
            </div>
          </div>

          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Package ที่เหมาะสม</div>
          {(() => {
            const phase = surveyPhase === "3_phase" ? 3 : surveyPhase === "1_phase" ? 1 : 0;
            const battery = surveyBattery;
            const availablePkgs = packages.filter(p => {
              if (p.phase !== 0 && phase !== 0 && p.phase !== phase) return false;
              if (battery === "upgrade") return p.is_upgrade;
              if (battery === "yes") return p.has_battery && !p.is_upgrade;
              if (battery === "no") return !p.has_battery && !p.is_upgrade;
              if (battery === "maybe") return !p.is_upgrade;
              return true;
            });
            return availablePkgs.length > 0 ? (
              <div className="grid grid-cols-1 gap-2">
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
                    }} className={`text-left rounded-xl p-3 border-2 transition-all ${selected ? "border-active bg-active-light" : "border-gray-100 bg-white"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-bold truncate flex items-center gap-1.5">
                            {p.is_upgrade && <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase shrink-0">UPGRADE</span>}
                            {p.name}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                            {p.solar_panels > 0 && <span>{p.solar_panels} panels</span>}
                            {p.inverter_brand && <span>{p.inverter_brand} {p.inverter_kw}kW</span>}
                            {p.has_battery && <span>Battery {p.battery_kwh}kWh</span>}
                            {p.is_upgrade && p.solar_panels === 0 && <span>เพิ่มแบตอย่างเดียว</span>}
                            <span className="inline-flex items-center gap-0.5 ml-1">
                              <svg className={`w-3.5 h-3.5 ${p.has_panel ? "text-amber-500" : "text-gray-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
                              <svg className={`w-3.5 h-3.5 ${p.has_inverter ? "text-violet-500" : "text-gray-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
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

          {/* ลายเซ็นลูกค้า */}
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">ลายเซ็นลูกค้า</div>
            <SignaturePad
              leadId={lead.id}
              fieldName="survey_customer_signature_url"
              initialUrl={lead.survey_customer_signature_url}
            />
          </div>

          {/* Confirm — สำรวจเสร็จสิ้น */}
          <button onClick={markDone} disabled={saving} className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            {saving ? "กำลังบันทึก…" : "สำรวจเสร็จสิ้น"}
          </button>
        </div>
      )}

      {/* Step 1: ระบบไฟฟ้า (PDF section 2) */}
      {lead.survey_confirmed && subStep === 1 && (
        <SurveyForm lead={lead} refresh={refresh} section="electrical" onFormChange={setFormDraft} onPhaseChange={(phase) => { setSurveyPhase(phase); setSelectedPkgs([]); apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interested_package_ids: null, interested_package_id: null }) }).catch(console.error); }} />
      )}

      {/* Step 2: หลังคา · บ้าน (PDF section 3) */}
      {lead.survey_confirmed && subStep === 2 && (
        <SurveyForm lead={lead} refresh={refresh} section="house" onFormChange={setFormDraft} />
      )}

      {/* Step 3: การเตรียมการติดตั้ง + บันทึก + รูปถ่าย */}
      {lead.survey_confirmed && subStep === 3 && (
        <div className="space-y-3">
          <SurveyForm lead={lead} refresh={refresh} section="prep" onFormChange={setFormDraft} />
          <div className="rounded-lg bg-white/60 border border-active/15 p-3">
            <label className="text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2">บันทึก Survey</label>
            <textarea value={surveyNote} onChange={e => setSurveyNote(e.target.value)} placeholder="บันทึกหน้างาน เช่น สภาพหลังคา, ข้อจำกัด, ข้อแนะนำ..." rows={3} className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary resize-none" />
          </div>
          <div className="rounded-lg bg-white/60 border border-active/15 p-3">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold tracking-wider uppercase text-gray-400">รูปถ่ายเพิ่มเติม</label>
              {surveyPhotos.length > 0 && <span className="text-xs text-gray-500">{surveyPhotos.length} รูป</span>}
            </div>
            <input type="file" accept="image/*" multiple capture="environment" onChange={handlePhotoCapture} className="hidden" id={`survey-photos-${lead.id}`} />
            {surveyPhotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-2">
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
              </div>
            )}
            <label htmlFor={`survey-photos-${lead.id}`} className="w-full h-10 rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center gap-2 cursor-pointer hover:border-active/40 hover:text-active text-gray-500 text-sm transition-colors">
              {photoUploading ? (<><div className="w-4 h-4 border-2 border-gray-300 border-t-active rounded-full animate-spin" /> กำลังอัปโหลด…</>) : (<><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg> เพิ่มรูปถ่าย</>)}
            </label>
          </div>
        </div>
      )}

      {/* Navigation */}
      {lead.survey_confirmed && subStep < 4 && (() => {
        const gates: Record<number, string[]> = {
          0: ["survey_confirmed"],
          1: [], 2: [], 3: [],
        };
        const handleNext = () => {
          const v = validateSurvey({ ...lead, ...formDraft, survey_note: surveyNote || lead.survey_note, survey_photos: surveyPhotos.length ? surveyPhotos.join(",") : lead.survey_photos, survey_wants_battery: surveyBattery || lead.survey_wants_battery, survey_electrical_phase: surveyPhase || lead.survey_electrical_phase, interested_package_id: selectedPkgs.length ? parseInt(selectedPkgs[0]) : lead.interested_package_id });
          const missingHere = v.missing.filter(m => (gates[subStep] || []).includes(m.field));
          if (missingHere.length > 0) {
            setNextError(missingHere.map(m => m.label).join(", "));
            return;
          }
          setNextError(null);
          setSubStep(subStep + 1);
          setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
        };
        return (
          <div className="flex gap-2 mt-3">
            {subStep > 0 && (
              <button type="button" onClick={() => { setNextError(null); setSubStep(subStep - 1); setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100); }} className="flex-1 h-11 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
                ย้อนกลับ
              </button>
            )}
            <button type="button" onClick={handleNext} className="flex-1 h-11 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 transition-colors flex items-center justify-center gap-1">
              ถัดไป
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </button>
          </div>
        );
      })()}
      {lead.survey_confirmed && subStep === 4 && (
        <button type="button" onClick={() => { setSubStep(subStep - 1); setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100); }} className="w-full h-9 mt-2 rounded-lg text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          ย้อนกลับ
        </button>
      )}

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
    </StepLayout>
  );
}

function DoneRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-gray-400 shrink-0">{label}</span>
      <span className="font-semibold text-gray-800 text-right">{value}</span>
    </div>
  );
}

function DoneGroup({ label, items }: { label: string; items: { label: string; value: string }[] }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-gray-400 shrink-0">{label}</span>
      <div className="text-right flex flex-wrap items-baseline justify-end gap-x-3 gap-y-0.5">
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
