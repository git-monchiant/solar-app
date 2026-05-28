"use client";
import { BoltIcon, CameraIcon } from "@/components/ui/icons";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { apiFetch, getUserIdHeader } from "@/lib/api";
import FallbackImage from "@/components/ui/FallbackImage";
import type { Lead, Package } from "./types";
import { formatTHB as formatPrice } from "@/lib/utils/formatters";

const RESIDENCE_TYPES = [
  { value: "detached", label: "บ้านเดี่ยว" },
  { value: "townhome", label: "ทาวน์โฮม" },
  { value: "townhouse", label: "ทาวน์เฮาส์" },
  { value: "home_office", label: "โฮมออฟฟิศ" },
  { value: "shophouse", label: "อาคารพาณิชย์" },
  { value: "other", label: "อื่นๆ" },
];

const ELECTRICAL_PHASES = [
  { value: "1_phase", label: "1 เฟส" },
  { value: "3_phase", label: "3 เฟส" },
];

const BATTERY_OPTIONS = [
  { value: "no", label: "ไม่ต้องการ" },
  { value: "yes", label: "ต้องการ" },
  { value: "maybe", label: "ยังไม่แน่ใจ" },
  { value: "upgrade", label: "+ Upgrade" },
];

const AC_BTU_SIZES = [9000, 12000, 18000, 24000];

const PEAK_USAGE = [
  { value: "day", label: "กลางวัน" },
  { value: "night", label: "กลางคืน" },
  { value: "both", label: "ทั้งสองช่วง" },
];

function parseAcUnits(s: string | null): Record<number, number> {
  const map: Record<number, number> = {};
  AC_BTU_SIZES.forEach(b => { map[b] = 0; });
  if (!s) return map;
  s.split(",").forEach(pair => {
    const [btu, count] = pair.split(":").map(Number);
    if (!isNaN(btu) && !isNaN(count) && AC_BTU_SIZES.includes(btu)) {
      map[btu] = count;
    }
  });
  return map;
}

function stringifyAcUnits(map: Record<number, number>): string | null {
  const pairs = AC_BTU_SIZES.filter(b => map[b] > 0).map(b => `${b}:${map[b]}`);
  return pairs.length > 0 ? pairs.join(",") : null;
}

const chipBtn = (selected: boolean) =>
  `h-9 px-3 rounded-lg text-xxs font-semibold border transition-all cursor-pointer ${
    selected
      ? "bg-active text-white border-active shadow-sm shadow-active/20"
      : "bg-white text-gray-600 border-gray-200 hover:border-active/40 hover:text-active"
  }`;

export interface PreSurveyFormHandle {
  flushSave: () => Promise<void>;
}

interface Props {
  lead: Lead;
  refresh: () => void;
  packages?: Package[];
  hideResidence?: boolean;
  hidePackages?: boolean;
  onlyPackages?: boolean;
  onPackageChange?: (pkgId: string) => void;
  onFormChange?: (data: Partial<Lead>) => void;
}

const PreSurveyForm = forwardRef<PreSurveyFormHandle, Props>(function PreSurveyForm({ lead, refresh, packages = [], hideResidence, hidePackages, onlyPackages, onPackageChange, onFormChange }, ref) {
  const [residenceType, setResidenceType] = useState<string>(lead.pre_residence_type ?? "");
  const [monthlyBill, setMonthlyBill] = useState<number | undefined>(lead.pre_monthly_bill ?? undefined);
  const [peakUsage, setPeakUsage] = useState<string>(lead.pre_peak_usage ?? "");
  const [electricalPhase, setElectricalPhase] = useState<string>(lead.pre_electrical_phase ?? "");
  const [wantsBattery, setWantsBattery] = useState<string>(lead.pre_wants_battery ?? "maybe");
  const [acUnits] = useState<Record<number, number>>(parseAcUnits(lead.pre_ac_units));
  const [pre_appliances, setAppliances] = useState<string[]>(
    lead.pre_appliances ? lead.pre_appliances.split(",").filter(Boolean) : []
  );
  const [roofShape] = useState<string>(lead.pre_roof_shape ?? "");
  const [billPhotoUrl, setBillPhotoUrl] = useState<string | null>(lead.pre_bill_photo_url ?? null);
  const [billUploading, setBillUploading] = useState(false);
  const [selectedPkgs, setSelectedPkgs] = useState<string[]>(
    lead.interested_package_ids ? lead.interested_package_ids.split(",").filter(Boolean) : lead.interested_package_id ? [String(lead.interested_package_id)] : []
  );
  const MAX_PKGS = 3;
  const togglePkg = (id: string) => {
    const next = selectedPkgs.includes(id) ? selectedPkgs.filter(p => p !== id) : selectedPkgs.length >= MAX_PKGS ? selectedPkgs : [...selectedPkgs, id];
    setSelectedPkgs(next);
    onPackageChange?.(next[0] || "");
  };

  const filteredPackages = packages.filter(p => {
    if (p.phase !== 0) {
      if (electricalPhase === "1_phase" && p.phase === 3) return false;
      if (electricalPhase === "3_phase" && p.phase === 1) return false;
    }
    if (wantsBattery === "upgrade") return p.is_upgrade;
    if (wantsBattery === "yes") return p.has_battery && !p.is_upgrade;
    if (wantsBattery === "no") return !p.has_battery && !p.is_upgrade;
    if (wantsBattery === "maybe") return !p.is_upgrade;
    return true;
  });

  const toggleAppliance = (v: string) => {
    setAppliances(prev => (prev.includes(v) ? prev.filter(a => a !== v) : [...prev, v]));
  };

  // Sync parent state immediately so validation sees latest values
  useEffect(() => {
    onFormChange?.({
      pre_residence_type: residenceType || null,
      pre_monthly_bill: monthlyBill ?? null,
      pre_peak_usage: peakUsage || null,
      pre_electrical_phase: electricalPhase || null,
      pre_wants_battery: wantsBattery || null,
      pre_ac_units: stringifyAcUnits(acUnits),
      pre_appliances: pre_appliances.length ? pre_appliances.join(",") : null,
      pre_roof_shape: roofShape || null,
      interested_package_ids: selectedPkgs.length ? selectedPkgs.join(",") : null,
      interested_package_id: selectedPkgs.length ? parseInt(selectedPkgs[0]) : null,
    } as Partial<Lead>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residenceType, monthlyBill, peakUsage, electricalPhase, wantsBattery, acUnits, pre_appliances, roofShape, selectedPkgs]);

  // Auto-save to DB (debounced). Pending payload is held in a ref so it can
  // flush on unmount — otherwise navigating to the next sub-step within 600ms
  // of a change cancels the save and loses data. After every successful save
  // we call refresh() so the parent's lead prop catches up; otherwise the next
  // mount would re-seed input state from a stale prop and look "empty".
  const isFirstAutosave = useRef(true);
  const pendingRef = useRef<{ payload: Record<string, unknown>; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => {
    if (isFirstAutosave.current) {
      isFirstAutosave.current = false;
      return;
    }
    const payload = {
      pre_residence_type: residenceType || null,
      pre_monthly_bill: monthlyBill ?? null,
      pre_peak_usage: peakUsage || null,
      pre_electrical_phase: electricalPhase || null,
      pre_wants_battery: wantsBattery || null,
      pre_ac_units: stringifyAcUnits(acUnits),
      pre_appliances: pre_appliances.length ? pre_appliances.join(",") : null,
      pre_roof_shape: roofShape || null,
      interested_package_ids: selectedPkgs.length ? selectedPkgs.join(",") : null,
      interested_package_id: selectedPkgs.length ? parseInt(selectedPkgs[0]) : null,
    };
    if (pendingRef.current) clearTimeout(pendingRef.current.timer);
    const timer = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(() => refresh()).catch(console.error);
      pendingRef.current = null;
    }, 600);
    pendingRef.current = { payload, timer };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residenceType, monthlyBill, peakUsage, electricalPhase, wantsBattery, acUnits, pre_appliances, roofShape, selectedPkgs]);

  // Flush any pending debounced save on unmount.
  useEffect(() => {
    return () => {
      if (pendingRef.current) {
        clearTimeout(pendingRef.current.timer);
        const payload = pendingRef.current.payload;
        pendingRef.current = null;
        apiFetch(`/api/leads/${lead.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).then(() => refresh()).catch(console.error);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Imperative flush — parent calls before advancing sub-step so the latest
  // typed value lands in DB regardless of debounce timing.
  useImperativeHandle(ref, () => ({
    flushSave: async () => {
      if (!pendingRef.current) return;
      clearTimeout(pendingRef.current.timer);
      const payload = pendingRef.current.payload;
      pendingRef.current = null;
      try {
        await apiFetch(`/api/leads/${lead.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        refresh();
      } catch (e) { console.error(e); }
    },
  }), [lead.id, refresh]);

  const handleBillPhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBillUploading(true);
    try {
      if (billPhotoUrl) {
        fetch(`/api/upload?file=${encodeURIComponent(billPhotoUrl)}`, {
          method: "DELETE",
          headers: { "ngrok-skip-browser-warning": "true", ...getUserIdHeader() },
        }).catch(() => {});
      }
      const fd = new FormData();
      fd.append("file", file);
      fd.append("lead_id", String(lead.id));
      fd.append("type", "bill");
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: fd,
        headers: { "ngrok-skip-browser-warning": "true", ...getUserIdHeader() },
      });
      const { url } = await uploadRes.json();
      setBillPhotoUrl(url);
      await apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pre_bill_photo_url: url }),
      });
      refresh();
    } finally {
      setBillUploading(false);
    }
  };

  const handleBillPhotoRemove = async () => {
    if (!billPhotoUrl) return;
    fetch(`/api/upload?file=${encodeURIComponent(billPhotoUrl)}`, {
      method: "DELETE",
      headers: { "ngrok-skip-browser-warning": "true", ...getUserIdHeader() },
    }).catch(() => {});
    setBillPhotoUrl(null);
    await apiFetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pre_bill_photo_url: null }),
    });
    refresh();
  };

  const sectionCls = "rounded-lg bg-white/60 border border-active/15 p-3";
  const sectionTitle = "text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2";
  const fieldLabel = "text-xs text-gray-500 block mb-1.5";

  return (
    <div className="space-y-2">
      {/* บ้าน */}
      {!hideResidence && (
        <div className={`${sectionCls} ${onlyPackages ? "hidden" : ""}`}>
          <label className={fieldLabel}>ประเภทบ้านพักอาศัย <span className="text-red-500">*</span></label>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {RESIDENCE_TYPES.map(r => (
              <button key={r.value} type="button" onClick={() => setResidenceType(r.value)} className={chipBtn(residenceType === r.value || (r.value === "other" && residenceType.startsWith("other")))}>
                {r.label}
              </button>
            ))}
          </div>
          {residenceType.startsWith("other") && (
            <input type="text" placeholder="ระบุประเภทบ้าน..." value={residenceType.startsWith("other:") ? residenceType.slice(6) : ""} onChange={e => setResidenceType(e.target.value ? `other:${e.target.value}` : "other")} className="w-full mt-2 h-11 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-active" />
          )}
        </div>
      )}

      {/* การใช้ไฟฟ้า */}
      <div className={`${sectionCls} ${onlyPackages ? "hidden" : ""}`}>
        <div className={sectionTitle}>การใช้ไฟฟ้า</div>
        <div className="space-y-3">
          <div>
            <label className={fieldLabel}>ค่าไฟต่อเดือน <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input type="number" inputMode="numeric" value={monthlyBill ?? ""} onChange={e => setMonthlyBill(e.target.value ? parseInt(e.target.value) : undefined)} placeholder="เช่น 3,500" className="w-full h-10 pl-3 pr-14 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">บาท</span>
              </div>
              <input type="file" accept="image/*" capture="environment" onChange={handleBillPhotoCapture} className="hidden" id={`bill-photo-${lead.id}`} />
              <label htmlFor={`bill-photo-${lead.id}`} className="shrink-0 h-10 w-10 rounded-lg border border-gray-200 bg-white flex items-center justify-center cursor-pointer hover:border-active/40 hover:text-active text-gray-500 transition-colors">
                {billUploading ? <div className="w-4 h-4 border-2 border-gray-300 border-t-active rounded-full animate-spin" /> : <CameraIcon className="w-5 h-5" strokeWidth={2} />}
              </label>
            </div>
            {billPhotoUrl && (
              <div className="mt-2 relative inline-block">
                <FallbackImage src={billPhotoUrl} alt="Bill" lightboxLabel="บิลค่าไฟ" className="h-20 rounded-lg border border-gray-200" />
                <button type="button" onClick={(e) => { e.stopPropagation(); handleBillPhotoRemove(); }} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shadow z-10">×</button>
              </div>
            )}
          </div>
          <div>
            <label className={fieldLabel}>ช่วงเวลาที่ใช้ไฟสูงสุด <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {PEAK_USAGE.map(p => (
                <button key={p.value} type="button" onClick={() => setPeakUsage(p.value)} className={chipBtn(peakUsage === p.value)}>{p.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={fieldLabel}>ระบบไฟปัจจุบัน <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {ELECTRICAL_PHASES.map(p => (
                <button key={p.value} type="button" onClick={() => { setElectricalPhase(p.value); setSelectedPkgs([]); }} className={chipBtn(electricalPhase === p.value)}>{p.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>


      {/* EV charger toggle — only appliance asked at pre-survey now (AC removed) */}
      <div className={`${sectionCls} ${onlyPackages ? "hidden" : ""}`}>
        <label className={fieldLabel}>ที่ชาร์จรถ EV</label>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <button type="button" onClick={() => { if (!pre_appliances.includes("ev")) toggleAppliance("ev"); }} className={chipBtn(pre_appliances.includes("ev"))}>มี</button>
          <button type="button" onClick={() => { if (pre_appliances.includes("ev")) toggleAppliance("ev"); }} className={chipBtn(!pre_appliances.includes("ev"))}>ไม่มี</button>
        </div>
      </div>

      {/* แบตเตอรี่ + แพ็คเกจ */}
      {packages.length > 0 && (
        <div className={`${sectionCls} ${hidePackages ? "hidden" : ""}`}>
          <div className="mb-3">
            <label className={fieldLabel}>ต้องการแบตเตอรี่ + Upgrade <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {BATTERY_OPTIONS.map(b => (
                <button key={b.value} type="button" onClick={() => { setWantsBattery(b.value); setSelectedPkgs([]); }} className={chipBtn(wantsBattery === b.value)}>{b.label}</button>
              ))}
            </div>
          </div>
          <div className={sectionTitle}>
            แพ็คเกจ
            {wantsBattery === "yes" && <span className="ml-2 text-xs font-medium text-gray-400 normal-case">· มีแบตเตอรี่</span>}
            {wantsBattery === "no" && <span className="ml-2 text-xs font-medium text-gray-400 normal-case">· ไม่มีแบตเตอรี่</span>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {filteredPackages.length === 0 && (
              <div className="col-span-full text-center py-6 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">ไม่มีแพ็คเกจที่ตรงกับที่เลือก</div>
            )}
            {filteredPackages.map(p => {
              const selected = selectedPkgs.includes(String(p.id));
              return (
                <button key={p.id} type="button" onClick={() => togglePkg(String(p.id))} className={`text-left rounded-xl p-3 border-2 transition-all ${selected ? "border-active bg-active-light" : "border-gray-100 bg-white"}`}>
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
                      <div className="text-sm font-bold font-mono tabular-nums">{formatPrice(p.price)}</div>
                      <div className="text-xs text-gray-400">THB</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

export default PreSurveyForm;
