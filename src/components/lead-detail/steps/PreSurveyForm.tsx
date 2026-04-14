"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Lead, Package } from "./types";

const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);

const RESIDENCE_TYPES = [
  { value: "detached", label: "บ้านเดี่ยว" },
  { value: "townhome", label: "ทาวน์โฮม" },
  { value: "townhouse", label: "ทาวน์เฮาส์" },
  { value: "home_office", label: "โฮมออฟฟิศ" },
  { value: "shophouse", label: "อาคารพาณิชย์" },
  { value: "other", label: "อื่นๆ" },
];

const ROOF_SHAPES: { value: string; label: string; svg: React.ReactNode }[] = [
  {
    value: "gable",
    label: "ทรงหน้าจั่ว",
    svg: (
      <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10">
        <path d="M6 22 L24 8 L42 22 L42 38 L6 38 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M24 8 L24 38" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
      </svg>
    ),
  },
  {
    value: "hip",
    label: "ปั้นหยา",
    svg: (
      <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10">
        <path d="M6 38 L10 22 L38 22 L42 38 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M10 22 L18 12 L30 12 L38 22" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M18 12 L10 22 M30 12 L38 22" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    value: "shed",
    label: "เพิงหมาแหงน",
    svg: (
      <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10">
        <path d="M6 20 L42 10 L42 38 L6 38 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    value: "flat",
    label: "ทรงแบน",
    svg: (
      <svg viewBox="0 0 48 48" fill="none" className="w-10 h-10">
        <path d="M6 14 L42 14 L42 38 L6 38 Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M6 14 L42 14" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
];

const ELECTRICAL_PHASES = [
  { value: "1_phase", label: "1 เฟส" },
  { value: "3_phase", label: "3 เฟส" },
];

const BATTERY_OPTIONS = [
  { value: "no", label: "ไม่ต้องการ" },
  { value: "yes", label: "ต้องการ" },
  { value: "maybe", label: "ยังไม่แน่ใจ" },
];

const APPLIANCES = [
  { value: "water_heater", label: "เครื่องทำน้ำอุ่น" },
  { value: "ev", label: "ที่ชาร์จรถ EV" },
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
  `h-9 px-3 rounded-lg text-[15px] font-semibold border transition-all cursor-pointer ${
    selected
      ? "bg-active text-white border-active shadow-sm shadow-active/20"
      : "bg-white text-gray-600 border-gray-200 hover:border-active/40 hover:text-active"
  }`;

interface Props {
  lead: Lead;
  refresh: () => void;
  packages?: Package[];
  hideResidence?: boolean;
  onPackageChange?: (pkgId: string) => void;
}

export default function PreSurveyForm({ lead, refresh, packages = [], hideResidence, onPackageChange }: Props) {
  const [residenceType, setResidenceType] = useState<string>(lead.pre_residence_type ?? "");
  const [monthlyBill, setMonthlyBill] = useState<number | undefined>(lead.pre_monthly_bill ?? undefined);
  const [peakUsage, setPeakUsage] = useState<string>(lead.pre_peak_usage ?? "");
  const [electricalPhase, setElectricalPhase] = useState<string>(lead.pre_electrical_phase ?? "");
  const [wantsBattery, setWantsBattery] = useState<string>(lead.pre_wants_battery ?? "");
  const [acUnits, setAcUnits] = useState<Record<number, number>>(parseAcUnits(lead.pre_ac_units));
  const [pre_appliances, setAppliances] = useState<string[]>(
    lead.pre_appliances ? lead.pre_appliances.split(",").filter(Boolean) : []
  );
  const [roofShape, setRoofShape] = useState<string>(lead.pre_roof_shape ?? "");
  const [billPhotoUrl, setBillPhotoUrl] = useState<string | null>(lead.pre_bill_photo_url ?? null);
  const [billUploading, setBillUploading] = useState(false);
  const [selectedPkgs, setSelectedPkgs] = useState<string[]>(
    lead.interested_package_ids ? lead.interested_package_ids.split(",").filter(Boolean) : lead.interested_package_id ? [String(lead.interested_package_id)] : []
  );
  const togglePkg = (id: string) => {
    setSelectedPkgs(prev => {
      const next = prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id];
      onPackageChange?.(next[0] || "");
      return next;
    });
  };

  const filteredPackages = packages.filter(p => {
    if (p.phase !== 0) {
      if (electricalPhase === "1_phase" && p.phase === 3) return false;
      if (electricalPhase === "3_phase" && p.phase === 1) return false;
    }
    if (wantsBattery === "yes") return p.has_battery;
    if (wantsBattery === "no") return !p.has_battery;
    return true;
  });

  const totalAcUnits = Object.values(acUnits).reduce((a, b) => a + b, 0);

  const toggleAppliance = (v: string) => {
    setAppliances(prev => (prev.includes(v) ? prev.filter(a => a !== v) : [...prev, v]));
  };

  const updateAcCount = (btu: number, delta: number) => {
    setAcUnits(prev => ({ ...prev, [btu]: Math.max(0, (prev[btu] || 0) + delta) }));
  };

  // Auto-save (debounced)
  const isFirstAutosave = useRef(true);
  useEffect(() => {
    if (isFirstAutosave.current) {
      isFirstAutosave.current = false;
      return;
    }
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pre_residence_type: residenceType || null,
          pre_monthly_bill: monthlyBill ?? null,
          pre_peak_usage: peakUsage || null,
          pre_electrical_phase: electricalPhase || null,
          pre_wants_battery: wantsBattery || null,
          pre_ac_units: stringifyAcUnits(acUnits),
          pre_appliances: pre_appliances.length ? pre_appliances.join(",") : null,
          interested_package_ids: selectedPkgs.length ? selectedPkgs.join(",") : null,
          interested_package_id: selectedPkgs.length ? parseInt(selectedPkgs[0]) : null,
        }),
      }).catch(console.error);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residenceType, monthlyBill, peakUsage, electricalPhase, wantsBattery, acUnits, pre_appliances, selectedPkgs]);

  const handleBillPhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBillUploading(true);
    try {
      if (billPhotoUrl) {
        fetch(`/api/upload?file=${encodeURIComponent(billPhotoUrl)}`, {
          method: "DELETE",
          headers: { "ngrok-skip-browser-warning": "true" },
        }).catch(() => {});
      }
      const fd = new FormData();
      fd.append("file", file);
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: fd,
        headers: { "ngrok-skip-browser-warning": "true" },
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
      headers: { "ngrok-skip-browser-warning": "true" },
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
        <div className={sectionCls}>
          <div className={sectionTitle}>บ้าน</div>
          <label className={fieldLabel}>ประเภทบ้านพักอาศัย</label>
          <div className="grid grid-cols-3 gap-2">
            {RESIDENCE_TYPES.map(r => (
              <button key={r.value} type="button" onClick={() => setResidenceType(r.value)} className={chipBtn(residenceType === r.value || (r.value === "other" && residenceType.startsWith("other")))}>
                {r.label}
              </button>
            ))}
          </div>
          {residenceType.startsWith("other") && (
            <input type="text" placeholder="ระบุประเภทบ้าน..." value={residenceType.startsWith("other:") ? residenceType.slice(6) : ""} onChange={e => setResidenceType(e.target.value ? `other:${e.target.value}` : "other")} className="w-full mt-2 h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-active" />
          )}
        </div>
      )}

      {/* การใช้ไฟฟ้า */}
      <div className={sectionCls}>
        <div className={sectionTitle}>การใช้ไฟฟ้า</div>
        <div className="space-y-3">
          <div>
            <label className={fieldLabel}>ค่าไฟต่อเดือน</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input type="number" inputMode="numeric" value={monthlyBill ?? ""} onChange={e => setMonthlyBill(e.target.value ? parseInt(e.target.value) : undefined)} placeholder="เช่น 3,500" className="w-full h-10 pl-3 pr-14 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">บาท</span>
              </div>
              <input type="file" accept="image/*" capture="environment" onChange={handleBillPhotoCapture} className="hidden" id={`bill-photo-${lead.id}`} />
              <label htmlFor={`bill-photo-${lead.id}`} className="shrink-0 h-10 w-10 rounded-lg border border-gray-200 bg-white flex items-center justify-center cursor-pointer hover:border-active/40 hover:text-active text-gray-500 transition-colors">
                {billUploading ? <div className="w-4 h-4 border-2 border-gray-300 border-t-active rounded-full animate-spin" /> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
              </label>
            </div>
            {billPhotoUrl && (
              <div className="mt-2 relative inline-block">
                <a href={billPhotoUrl} target="_blank" rel="noreferrer"><img src={billPhotoUrl} alt="Bill" className="h-20 rounded-lg border border-gray-200" /></a>
                <button type="button" onClick={handleBillPhotoRemove} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shadow">×</button>
              </div>
            )}
          </div>
          <div>
            <label className={fieldLabel}>ช่วงเวลาที่ใช้ไฟสูงสุด</label>
            <div className="grid grid-cols-3 gap-2">
              {PEAK_USAGE.map(p => (
                <button key={p.value} type="button" onClick={() => setPeakUsage(p.value)} className={chipBtn(peakUsage === p.value)}>{p.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={fieldLabel}>ระบบไฟปัจจุบัน</label>
            <div className="grid grid-cols-3 gap-2">
              {ELECTRICAL_PHASES.map(p => (
                <button key={p.value} type="button" onClick={() => { setElectricalPhase(p.value); setSelectedPkgs([]); }} className={chipBtn(electricalPhase === p.value)}>{p.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>


      {/* เครื่องใช้ไฟฟ้า */}
      <div className={sectionCls}>
        <div className={sectionTitle}>เครื่องใช้ไฟฟ้า</div>
        <div className="space-y-3">
          <div>
            <label className={fieldLabel}>ต้องการแบตเตอรี่</label>
            <div className="grid grid-cols-3 gap-2">
              {BATTERY_OPTIONS.map(b => (
                <button key={b.value} type="button" onClick={() => { setWantsBattery(b.value); setSelectedPkgs([]); }} className={chipBtn(wantsBattery === b.value)}>{b.label}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className={fieldLabel}>เครื่องปรับอากาศ</label>
              {totalAcUnits > 0 && <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-600/15 px-1.5 py-0.5 rounded">รวม {totalAcUnits} เครื่อง</span>}
            </div>
            <div className="space-y-1.5">
              {AC_BTU_SIZES.map(btu => {
                const count = acUnits[btu] || 0;
                return (
                  <div key={btu} className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-gray-700 font-mono tabular-nums">{btu.toLocaleString()} <span className="text-xs text-gray-400 font-sans">BTU</span></span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => updateAcCount(btu, -1)} disabled={count === 0} className="w-9 h-9 rounded-md border border-gray-200 text-gray-600 text-lg font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:border-gray-400">−</button>
                      <span className="w-8 text-center text-sm font-bold tabular-nums text-gray-900">{count}</span>
                      <button type="button" onClick={() => updateAcCount(btu, 1)} className="w-9 h-9 rounded-md border border-gray-200 text-gray-600 text-lg font-semibold hover:border-gray-400">+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <label className={fieldLabel}>เครื่องใช้ไฟฟ้าอื่นๆ</label>
            <div className="grid grid-cols-3 gap-2">
              {APPLIANCES.map(a => (
                <button key={a.value} type="button" onClick={() => toggleAppliance(a.value)} className={chipBtn(pre_appliances.includes(a.value))}>{a.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* แพ็คเกจ */}
      {packages.length > 0 && (
        <div className={sectionCls}>
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
                      <div className="text-sm font-bold truncate">{p.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5 flex flex-wrap gap-x-3">
                        {p.solar_panels && <span>{p.solar_panels} panels</span>}
                        {p.inverter_brand && <span>{p.inverter_brand} {p.inverter_kw}kW</span>}
                        {p.has_battery && <span>Battery {p.battery_kwh}kWh</span>}
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
}
