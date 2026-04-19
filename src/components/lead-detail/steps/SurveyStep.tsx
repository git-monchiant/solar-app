"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { StepCommonProps, Package, Lead } from "./types";
import SurveyForm from "./SurveyForm";
import AppointmentRescheduler from "@/components/AppointmentRescheduler";
import ErrorPopup from "@/components/ErrorPopup";
import { validateSurvey } from "@/lib/step-validators";
import FallbackImage from "@/components/FallbackImage";
import StepLayout from "../StepLayout";
import { useSubStep } from "@/lib/useSubStep";
import { compressImage } from "@/lib/compressImage";

const formatDate = (d: string) =>
  new Date(String(d).slice(0, 10) + "T12:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

const SURVEY_TIME_SLOTS = [
  { value: "morning", label: "เช้า", time: "09:00 - 12:00" },
  { value: "afternoon", label: "บ่าย", time: "13:00 - 16:00" },
];

const RESIDENCE_MAP: Record<string, string> = { detached: "บ้านเดี่ยว", townhome: "ทาวน์โฮม", townhouse: "ทาวน์เฮาส์", home_office: "โฮมออฟฟิศ", shophouse: "อาคารพาณิชย์" };
const ROOF_MATERIAL_MAP: Record<string, string> = { concrete_tile: "กระเบื้องคอนกรีต", clay_tile: "กระเบื้องดินเผา", metal_sheet: "เมทัลชีท", concrete_slab: "พื้นคอนกรีต" };
const PEAK_MAP: Record<string, string> = { morning: "ช่วงเช้า", afternoon: "ช่วงบ่าย", both: "ทั้งสองช่วง" };
const SHADING_MAP: Record<string, string> = { none: "ไม่มี", light: "เล็กน้อย", moderate: "ปานกลาง", heavy: "มาก" };
const ROOF_AGE_MAP: Record<string, string> = { new: "ใหม่ (< 5 ปี)", mid: "กลาง (5-15 ปี)", old: "เก่า (> 15 ปี)" };
const APPLIANCE_MAP: Record<string, string> = { ev: "EV Charger", pool_pump: "ปั๊มสระ", water_heater: "เครื่องทำน้ำร้อน", elevator: "ลิฟต์" };
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
  const SURVEY_SUB_FULL = ["นัด", "บ้าน", "ไฟฟ้า", "แพ็คเกจ", "บันทึก", "ยืนยัน"];
  const SURVEY_SUB = lead.survey_confirmed ? SURVEY_SUB_FULL : ["นัด"];
  const [subStep, setSubStep] = useSubStep(`surveySubStep_${lead.id}`, 0, SURVEY_SUB.length);
  const [nextError, setNextError] = useState<string | null>(null);
  const [formDraft, setFormDraft] = useState<Partial<Lead>>({});
  const [selectedPkg, setSelectedPkg] = useState<string>(lead.interested_package_id ? String(lead.interested_package_id) : "");
  const [surveyBattery, setSurveyBattery] = useState<string>(lead.survey_wants_battery ?? lead.pre_wants_battery ?? "");
  const [surveyPhase, setSurveyPhase] = useState<string>(lead.survey_electrical_phase ?? lead.pre_electrical_phase ?? "");
  const [rescheduling, setRescheduling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [surveyNote, setSurveyNote] = useState<string>(lead.survey_note ?? "");
  const [surveyPhotos, setSurveyPhotos] = useState<string[]>(lead.survey_photos ? lead.survey_photos.split(",").filter(Boolean) : []);
  const [photoUploading, setPhotoUploading] = useState(false);
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
        const res = await fetch("/api/upload", {
          method: "POST",
          body: fd,
          headers: { "ngrok-skip-browser-warning": "true" },
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
      headers: { "ngrok-skip-browser-warning": "true" },
    }).catch(() => {});
    await persistPhotos(surveyPhotos.filter(u => u !== url));
  };

  const confirmAppointment = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survey_confirmed: true }),
      });
      refresh();
    } finally {
      setSaving(false);
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
      refresh();
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
    </>
  );

  if (state === "done") {
    const residenceLabel = lead.survey_residence_type?.startsWith("other:") ? lead.survey_residence_type.slice(6) : RESIDENCE_MAP[lead.survey_residence_type || ""];
    const acMap = parseAcUnits(lead.survey_ac_units);
    const acTotal = Object.values(acMap).reduce((a, b) => a + b, 0);
    const applianceList = (lead.survey_appliances || "").split(",").filter(Boolean).map(v => APPLIANCE_MAP[v] || v);

    const renderDoneContent = () => (<>

          {/* บ้าน · หลังคา */}
          {(residenceLabel || lead.survey_floors != null || lead.survey_roof_material || lead.survey_roof_orientation || lead.survey_roof_area_m2 || lead.survey_roof_tilt != null || lead.survey_shading || lead.survey_roof_age) && (
            <div className="border-l-3 border-amber-400 pl-3">
              <div className="text-xs font-bold text-amber-600 uppercase mb-1">บ้าน · หลังคา</div>
              <div className="space-y-0.5">
                {residenceLabel && <div className="flex justify-between"><span className="text-gray-400">ประเภทบ้าน</span><span className="font-semibold text-gray-800">{residenceLabel}</span></div>}
                {lead.survey_floors != null && <div className="flex justify-between"><span className="text-gray-400">จำนวนชั้น</span><span className="font-semibold text-gray-800">{lead.survey_floors}</span></div>}
                {lead.survey_roof_material && <div className="flex justify-between"><span className="text-gray-400">วัสดุหลังคา</span><span className="font-semibold text-gray-800">{ROOF_MATERIAL_MAP[lead.survey_roof_material] || lead.survey_roof_material}</span></div>}
                {lead.survey_roof_orientation && <div className="flex justify-between"><span className="text-gray-400">ทิศหลังคา</span><span className="font-semibold text-gray-800">{lead.survey_roof_orientation}</span></div>}
                {lead.survey_roof_area_m2 && <div className="flex justify-between"><span className="text-gray-400">พื้นที่</span><span className="font-semibold text-gray-800">{lead.survey_roof_area_m2} m²</span></div>}
                {lead.survey_roof_tilt != null && <div className="flex justify-between"><span className="text-gray-400">ความชัน</span><span className="font-semibold text-gray-800">{lead.survey_roof_tilt}°</span></div>}
                {lead.survey_shading && <div className="flex justify-between"><span className="text-gray-400">ร่มเงา</span><span className="font-semibold text-gray-800">{SHADING_MAP[lead.survey_shading] || lead.survey_shading}</span></div>}
                {lead.survey_roof_age && <div className="flex justify-between"><span className="text-gray-400">อายุหลังคา</span><span className="font-semibold text-gray-800">{ROOF_AGE_MAP[lead.survey_roof_age] || lead.survey_roof_age}</span></div>}
              </div>
            </div>
          )}

          {/* การใช้ไฟฟ้า */}
          {(lead.survey_electrical_phase || lead.survey_monthly_bill != null || lead.survey_peak_usage || lead.survey_grid_type || lead.survey_utility || lead.survey_meter_size || lead.survey_ca_number || lead.survey_db_distance_m != null) && (
            <div className="border-l-3 border-blue-400 pl-3">
              <div className="text-xs font-bold text-blue-600 uppercase mb-1">การใช้ไฟฟ้า</div>
              <div className="space-y-0.5">
                {lead.survey_electrical_phase && <div className="flex justify-between"><span className="text-gray-400">ระบบไฟ</span><span className="font-semibold text-gray-800">{lead.survey_electrical_phase === "1_phase" ? "1 เฟส" : "3 เฟส"}</span></div>}
                {lead.survey_monthly_bill != null && <div className="flex justify-between"><span className="text-gray-400">ค่าไฟ/เดือน</span><span className="font-semibold text-gray-800 font-mono">{lead.survey_monthly_bill.toLocaleString()} บาท</span></div>}
                {lead.survey_peak_usage && <div className="flex justify-between"><span className="text-gray-400">ช่วงใช้ไฟสูงสุด</span><span className="font-semibold text-gray-800">{PEAK_MAP[lead.survey_peak_usage] || lead.survey_peak_usage}</span></div>}
                {lead.survey_grid_type && <div className="flex justify-between"><span className="text-gray-400">เชื่อมต่อ</span><span className="font-semibold text-gray-800">{lead.survey_grid_type === "on_grid" ? "On-Grid" : lead.survey_grid_type === "hybrid" ? "Hybrid" : "Off-Grid"}</span></div>}
                {lead.survey_utility && <div className="flex justify-between"><span className="text-gray-400">การไฟฟ้า</span><span className="font-semibold text-gray-800">{lead.survey_utility}</span></div>}
                {lead.survey_meter_size && <div className="flex justify-between"><span className="text-gray-400">มิเตอร์</span><span className="font-semibold text-gray-800">{lead.survey_meter_size.replace("_", "(") + ") A"}</span></div>}
                {lead.survey_ca_number && <div className="flex justify-between"><span className="text-gray-400">เลข CA</span><span className="font-semibold text-gray-800 font-mono">{lead.survey_ca_number}</span></div>}
                {lead.survey_wants_battery && <div className="flex justify-between"><span className="text-gray-400">แบตเตอรี่</span><span className="font-semibold text-gray-800">{lead.survey_wants_battery === "yes" ? "ต้องการ" : lead.survey_wants_battery === "no" ? "ไม่ต้องการ" : "ยังไม่แน่ใจ"}</span></div>}
                {lead.survey_db_distance_m != null && <div className="flex justify-between"><span className="text-gray-400">ระยะ MDB</span><span className="font-semibold text-gray-800">{lead.survey_db_distance_m} เมตร</span></div>}
              </div>
            </div>
          )}

          {/* เครื่องใช้ไฟฟ้า */}
          {(acTotal > 0 || applianceList.length > 0) && (
            <div className="border-l-3 border-violet-400 pl-3">
              <div className="text-xs font-bold text-violet-600 uppercase mb-1">เครื่องใช้ไฟฟ้า</div>
              {acTotal > 0 && (
                <div className="mb-1.5">
                  <span className="text-xs text-gray-400">แอร์ ({acTotal} เครื่อง)</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {AC_BTU_SIZES.filter(b => acMap[b] > 0).map(b => (
                      <span key={b} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-50 text-xs font-mono text-violet-700">
                        {b.toLocaleString()} BTU <span className="font-bold">× {acMap[b]}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {applianceList.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {applianceList.map(a => (
                    <span key={a} className="px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-600">{a}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* แพ็คเกจที่เลือก */}
          {lead.interested_package_id && (() => {
            const pkg = packages.find(p => p.id === lead.interested_package_id);
            if (!pkg) return null;
            return (
              <div className="border-l-3 border-emerald-400 pl-3">
                <div className="text-xs font-bold text-emerald-600 uppercase mb-1">แพ็คเกจที่เลือก</div>
                <div className="space-y-0.5">
                  <div className="flex justify-between"><span className="text-gray-400">ชื่อ</span><span className="font-semibold text-gray-800">{pkg.name}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">kWp</span><span className="font-semibold text-gray-800">{pkg.kwp}</span></div>
                  {pkg.solar_panels > 0 && <div className="flex justify-between"><span className="text-gray-400">แผง</span><span className="font-semibold text-gray-800">{pkg.solar_panels} × {pkg.panel_watt}W</span></div>}
                  {pkg.inverter_kw > 0 && <div className="flex justify-between"><span className="text-gray-400">Inverter</span><span className="font-semibold text-gray-800">{pkg.inverter_brand} {pkg.inverter_kw}kW</span></div>}
                  {pkg.has_battery && <div className="flex justify-between"><span className="text-gray-400">Battery</span><span className="font-semibold text-gray-800">{pkg.battery_kwh}kWh {pkg.battery_brand || ""}</span></div>}
                  <div className="flex justify-between"><span className="text-gray-400">ราคา</span><span className="font-semibold text-gray-800 font-mono">{pkg.price.toLocaleString()} บาท</span></div>
                </div>
              </div>
            );
          })()}

          {/* บันทึก */}
          {lead.survey_note && (
            <div className="border-l-3 border-gray-300 pl-3">
              <div className="text-xs font-bold text-gray-400 uppercase mb-1">บันทึก</div>
              <div className="text-gray-800">{lead.survey_note}</div>
            </div>
          )}

          {/* รูปถ่าย */}
          {lead.survey_photos && (
            <div className="border-l-3 border-gray-300 pl-3">
              <div className="text-xs font-bold text-gray-400 uppercase mb-1.5">รูปถ่าย</div>
              <div className="grid grid-cols-3 gap-2">
                {lead.survey_photos.split(",").filter(Boolean).map(url => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <FallbackImage src={url} alt="Survey" className="w-full aspect-square object-cover rounded-lg border border-gray-200" fallbackLabel="รูปหาย" />
                  </a>
                ))}
              </div>
            </div>
          )}
    </>);

    return (
      <StepLayout
        state="done"
        doneHeader={doneHeaderContent}
        renderDone={renderDoneContent}
        expanded={expanded}
        onToggle={onToggle}
      />
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
      1: ["survey_residence_type", "survey_floors", "survey_roof_material", "survey_roof_orientation", "survey_roof_area_m2", "survey_roof_tilt", "survey_shading", "survey_roof_age"],
      2: ["survey_electrical_phase", "survey_monthly_bill", "survey_peak_usage", "survey_grid_type", "survey_utility", "survey_meter_size", "survey_ca_number", "survey_db_distance_m"],
      3: ["survey_wants_battery", "interested_package_id"],
      4: ["survey_note", "survey_photos"],
      5: [],
    };
    const v = validateSurvey({ ...lead, ...formDraft, survey_note: surveyNote || lead.survey_note, survey_photos: surveyPhotos.length ? surveyPhotos.join(",") : lead.survey_photos, survey_wants_battery: surveyBattery || lead.survey_wants_battery, survey_electrical_phase: surveyPhase || lead.survey_electrical_phase, interested_package_id: selectedPkg ? parseInt(selectedPkg) : lead.interested_package_id });
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
            <button onClick={confirmAppointment} disabled={saving} className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors">
              {saving ? "…" : "ยืนยันนัดหมาย"}
            </button>
          )}
        </div>
      )}

      {/* Step 4: แพ็คเกจ */}
      {lead.survey_confirmed && subStep === 3 && (
        <div className="rounded-lg bg-white/60 border border-active/15 p-3 space-y-3">
          <div>
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">ต้องการแบตเตอรี่ + Upgrade</div>
            <div className="grid grid-cols-3 gap-2">
              {[{ value: "no", label: "ไม่ต้องการ" }, { value: "yes", label: "ต้องการ" }, { value: "maybe", label: "ยังไม่แน่ใจ" }, { value: "upgrade", label: "+ Upgrade" }].map(b => (
                <button key={b.value} type="button" onClick={() => {
                  setSurveyBattery(b.value);
                  setSelectedPkg("");
                  apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ survey_wants_battery: b.value, interested_package_id: null }) }).catch(console.error);
                }} className={`h-9 rounded-lg text-xs font-semibold border transition-all ${surveyBattery === b.value ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200"}`}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">ยืนยันแพ็คเกจที่จะติดตั้ง (1 รายการ)</div>
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
                  const selected = selectedPkg === String(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => {
                      setSelectedPkg(String(p.id));
                      apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interested_package_id: p.id }) }).catch(console.error);
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
        </div>
      )}

      {/* Step 2: บ้าน · หลังคา */}
      {lead.survey_confirmed && subStep === 1 && (
        <SurveyForm lead={lead} refresh={refresh} section="house" onFormChange={setFormDraft} />
      )}

      {/* Step 3: ระบบไฟฟ้า */}
      {lead.survey_confirmed && subStep === 2 && (
        <SurveyForm lead={lead} refresh={refresh} section="electrical" onFormChange={setFormDraft} onPhaseChange={(phase) => { setSurveyPhase(phase); setSelectedPkg(""); apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interested_package_id: null }) }).catch(console.error); }} />
      )}

      {/* Step 5: บันทึก + รูปถ่าย */}
      {lead.survey_confirmed && subStep === 4 && (
        <div className="space-y-3">
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
                {surveyPhotos.map(url => (
                  <div key={url} className="relative aspect-square">
                    <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Survey" className="w-full h-full object-cover rounded-lg border border-gray-200" /></a>
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

      {/* Step 6: ยืนยัน */}
      {lead.survey_confirmed && subStep === 5 && (
        <div className="space-y-3">
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            </div>
            <div className="text-sm font-bold text-gray-800">ข้อมูลสำรวจครบถ้วน</div>
            <div className="text-xs text-gray-500 mt-1">กดปุ่มด้านล่างเพื่อจบขั้นตอนสำรวจ</div>
          </div>
          <button onClick={markDone} disabled={saving} className="w-full h-11 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-primary to-primary-dark hover:brightness-110 disabled:opacity-50 transition-colors">
            สำรวจเสร็จสิ้น
          </button>
        </div>
      )}

      {/* Navigation */}
      {lead.survey_confirmed && subStep < 5 && (() => {
        const gates: Record<number, string[]> = {
          0: ["survey_confirmed"],
          1: ["survey_residence_type", "survey_floors", "survey_roof_material", "survey_roof_orientation", "survey_roof_area_m2", "survey_roof_tilt", "survey_shading", "survey_roof_age"],
          2: ["survey_electrical_phase", "survey_monthly_bill", "survey_peak_usage", "survey_grid_type", "survey_utility", "survey_meter_size", "survey_ca_number", "survey_db_distance_m"],
          3: ["survey_wants_battery", "interested_package_id"],
          4: ["survey_note", "survey_photos"],
        };
        const handleNext = () => {
          const v = validateSurvey({ ...lead, ...formDraft, survey_note: surveyNote || lead.survey_note, survey_photos: surveyPhotos.length ? surveyPhotos.join(",") : lead.survey_photos, survey_wants_battery: surveyBattery || lead.survey_wants_battery, survey_electrical_phase: surveyPhase || lead.survey_electrical_phase, interested_package_id: selectedPkg ? parseInt(selectedPkg) : lead.interested_package_id });
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
      {lead.survey_confirmed && subStep === 5 && (
        <button type="button" onClick={() => { setSubStep(subStep - 1); setTimeout(() => document.querySelector("[data-step-active]")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100); }} className="w-full h-9 mt-2 rounded-lg text-xs text-gray-500 border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          ย้อนกลับ
        </button>
      )}

      <ErrorPopup message={nextError} onClose={() => setNextError(null)} />
    </StepLayout>
  );
}
