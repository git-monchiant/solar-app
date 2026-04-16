"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Lead } from "./types";

const chipBtn = (selected: boolean) =>
  `h-9 px-3 rounded-lg text-[15px] font-semibold border transition-all cursor-pointer ${
    selected
      ? "bg-active text-white border-active shadow-sm shadow-active/20"
      : "bg-white text-gray-600 border-gray-200 hover:border-active/40 hover:text-active"
  }`;

const ROOF_MATERIALS = [
  { value: "metal_sheet", label: "เมทัลชีท" },
  { value: "cpac_tile", label: "กระเบื้องลอน CPAC" },
  { value: "old_tile", label: "กระเบื้องลอนเก่า" },
  { value: "flat_tile", label: "กระเบื้องแบน" },
  { value: "concrete", label: "ดาดฟ้าคอนกรีต" },
  { value: "shingle", label: "ชิงเกิ้ล" },
];

const ROOF_ORIENTATIONS = [
  { value: "north", label: "เหนือ" },
  { value: "south", label: "ใต้" },
  { value: "east", label: "ออก" },
  { value: "west", label: "ตก" },
];

const GRID_TYPES = [
  { value: "on_grid", label: "On-Grid" },
  { value: "hybrid", label: "Hybrid" },
  { value: "off_grid", label: "Off-Grid" },
];

const UTILITIES = [
  { value: "MEA", label: "MEA" },
  { value: "PEA", label: "PEA" },
];

const METER_SIZES: Record<string, { value: string; label: string }[]> = {
  "1_phase": [
    { value: "5_15", label: "5(15) A" },
    { value: "15_45", label: "15(45) A" },
  ],
  "3_phase": [
    { value: "15_45", label: "15(45) A" },
    { value: "30_100", label: "30(100) A" },
  ],
};

const FLOORS = [
  { value: 1, label: "1 ชั้น" },
  { value: 2, label: "2 ชั้น" },
  { value: 3, label: "3+ ชั้น" },
];

const SHADING = [
  { value: "none", label: "ไม่มี" },
  { value: "partial", label: "บางช่วง" },
  { value: "heavy", label: "ตลอดวัน" },
];

const ROOF_AGES = [
  { value: "new", label: "< 5 ปี" },
  { value: "mid", label: "5-10 ปี" },
  { value: "old", label: "> 10 ปี" },
];

const ROOF_TILTS = [0, 15, 25, 35];


const RESIDENCE_TYPES = [
  { value: "detached", label: "บ้านเดี่ยว" },
  { value: "townhome", label: "ทาวน์โฮม" },
  { value: "townhouse", label: "ทาวน์เฮาส์" },
  { value: "home_office", label: "โฮมออฟฟิศ" },
  { value: "shophouse", label: "อาคารพาณิชย์" },
  { value: "other", label: "อื่นๆ" },
];

const PEAK_USAGE = [
  { value: "day", label: "กลางวัน" },
  { value: "night", label: "กลางคืน" },
  { value: "both", label: "ทั้งสองช่วง" },
];

const APPLIANCES = [
  { value: "water_heater", label: "เครื่องทำน้ำอุ่น" },
  { value: "ev", label: "ที่ชาร์จรถ EV" },
];

const AC_BTU_SIZES = [9000, 12000, 18000, 24000];

function parseAcUnits(s: string | null): Record<number, number> {
  const map: Record<number, number> = {};
  AC_BTU_SIZES.forEach(b => { map[b] = 0; });
  if (!s) return map;
  s.split(",").forEach(pair => {
    const [btu, count] = pair.split(":").map(Number);
    if (!isNaN(btu) && !isNaN(count) && AC_BTU_SIZES.includes(btu)) map[btu] = count;
  });
  return map;
}

function stringifyAcUnits(map: Record<number, number>): string | null {
  const pairs = AC_BTU_SIZES.filter(b => map[b] > 0).map(b => `${b}:${map[b]}`);
  return pairs.length > 0 ? pairs.join(",") : null;
}

interface Props {
  lead: Lead;
  refresh: () => void;
  section?: "house" | "electrical" | "all";
  onPhaseChange?: (phase: string) => void;
}

export default function SurveyForm({ lead, refresh, section = "all", onPhaseChange }: Props) {
  // Must-have on-site
  const [roofMaterial, setRoofMaterial] = useState<string>(lead.survey_roof_material ?? "");
  const [roofOrientations, setRoofOrientations] = useState<string[]>(
    (lead.survey_roof_orientation ?? "").split(",").filter(Boolean)
  );
  const toggleOrientation = (v: string) =>
    setRoofOrientations(prev => prev.includes(v) ? prev.filter(o => o !== v) : [...prev, v]);
  const [floors, setFloors] = useState<number | null>(lead.survey_floors ?? null);
  const [roofArea, setRoofArea] = useState<number | "">(lead.survey_roof_area_m2 ?? "");
  const [gridType, setGridType] = useState<string>(lead.survey_grid_type ?? "on_grid");
  const [utility, setUtility] = useState<string>(lead.survey_utility ?? "");
  const [caNumber, setCaNumber] = useState<string>(lead.survey_ca_number ?? "");
  const [meterSize, setMeterSize] = useState<string>(lead.survey_meter_size ?? "");
  const [dbDistance, setDbDistance] = useState<number | "">(lead.survey_db_distance_m ?? "");

  // Nice-to-have
  const [shading, setShading] = useState<string>(lead.survey_shading ?? "");
  const [roofAge, setRoofAge] = useState<string>(lead.survey_roof_age ?? "");
  const [roofTilt, setRoofTilt] = useState<number | null>(lead.survey_roof_tilt ?? null);

  const [electricalPhase, setElectricalPhase] = useState<string>(lead.survey_electrical_phase ?? lead.pre_electrical_phase ?? "");

  // Duplicates of pre_* (default from pre_*)
  const [residenceType, setResidenceType] = useState<string>(lead.survey_residence_type ?? lead.pre_residence_type ?? "");
  const [monthlyBill, setMonthlyBill] = useState<number | "">(lead.survey_monthly_bill ?? lead.pre_monthly_bill ?? "");
  const [peakUsage, setPeakUsage] = useState<string>(lead.survey_peak_usage ?? lead.pre_peak_usage ?? "");
  const [appliances, setAppliances] = useState<string[]>(
    (lead.survey_appliances ?? lead.pre_appliances ?? "").split(",").filter(Boolean)
  );
  const [acUnits, setAcUnits] = useState<Record<number, number>>(
    parseAcUnits(lead.survey_ac_units ?? lead.pre_ac_units)
  );
  const totalAc = Object.values(acUnits).reduce((a, b) => a + b, 0);
  const toggleAppliance = (v: string) => setAppliances(prev => prev.includes(v) ? prev.filter(a => a !== v) : [...prev, v]);
  const updateAc = (btu: number, delta: number) => setAcUnits(prev => ({ ...prev, [btu]: Math.max(0, (prev[btu] || 0) + delta) }));

  // Auto-save
  const isFirst = useRef(true);
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    const t = setTimeout(() => {
      apiFetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survey_roof_material: roofMaterial || null,
          survey_roof_orientation: roofOrientations.length ? roofOrientations.join(",") : null,
          survey_floors: floors,
          survey_roof_area_m2: typeof roofArea === "number" ? roofArea : null,
          survey_grid_type: gridType || null,
          survey_utility: utility || null,
          survey_ca_number: caNumber || null,
          survey_meter_size: meterSize || null,
          survey_db_distance_m: typeof dbDistance === "number" ? dbDistance : null,
          survey_shading: shading || null,
          survey_roof_age: roofAge || null,
          survey_roof_tilt: roofTilt,
          survey_residence_type: residenceType || null,
          survey_monthly_bill: typeof monthlyBill === "number" ? monthlyBill : null,
          survey_peak_usage: peakUsage || null,
          survey_appliances: appliances.length ? appliances.join(",") : null,
          survey_ac_units: stringifyAcUnits(acUnits),
          survey_electrical_phase: electricalPhase || null,
        }),
      }).catch(console.error);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roofMaterial, roofOrientations, floors, roofArea, gridType, utility, caNumber, meterSize, dbDistance, shading, roofAge, roofTilt, residenceType, monthlyBill, peakUsage, appliances, acUnits, electricalPhase]);

  const card = "rounded-lg bg-white/60 border border-active/15 p-3";
  const label = "text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2";

  const subLabel = "text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2";

  return (
    <div className="space-y-2">
      {/* Residence — type + floors */}
      {(section === "all" || section === "house") && <><div className={card}>
        <div className="space-y-4">
          <div>
            <div className={subLabel}>ประเภทบ้านพักอาศัย <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-3 gap-2">
              {RESIDENCE_TYPES.map(r => (
                <button key={r.value} type="button" onClick={() => setResidenceType(r.value)} className={chipBtn(residenceType === r.value || (r.value === "other" && residenceType.startsWith("other")))}>
                  {r.label}
                </button>
              ))}
            </div>
            {residenceType.startsWith("other") && (
              <input
                type="text"
                placeholder="ระบุประเภทบ้าน..."
                value={residenceType.startsWith("other:") ? residenceType.slice(6) : ""}
                onChange={e => setResidenceType(e.target.value ? `other:${e.target.value}` : "other")}
                className="w-full mt-2 h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-active"
              />
            )}
          </div>
          <div>
            <div className={subLabel}>จำนวนชั้น <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-3 gap-2">
              {FLOORS.map(f => (
                <button key={f.value} type="button" onClick={() => setFloors(f.value)} className={chipBtn(floors === f.value)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div></>}

      {/* การใช้ไฟฟ้า — bill + peak time */}
      {(section === "all" || section === "house") && <><div className={card}>
        <div className="space-y-4">
          <div>
            <div className={subLabel}>ค่าไฟต่อเดือน <span className="text-red-500">*</span></div>
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                value={monthlyBill === "" ? "" : monthlyBill}
                onChange={e => setMonthlyBill(e.target.value ? parseInt(e.target.value) : "")}
                placeholder="เช่น 3,500"
                className="w-full h-10 pl-3 pr-14 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">บาท</span>
            </div>
          </div>
          <div>
            <div className={subLabel}>ช่วงเวลาที่ใช้ไฟสูงสุด <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-3 gap-2">
              {PEAK_USAGE.map(p => (
                <button key={p.value} type="button" onClick={() => setPeakUsage(p.value)} className={chipBtn(peakUsage === p.value)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div></>}

      {/* Roof — must-have on-site fields in one card */}
      {(section === "all" || section === "house") && <><div className={card}>
        <div className="space-y-4">
          <div>
            <div className={subLabel}>วัสดุหลังคา <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-3 gap-2">
              {ROOF_MATERIALS.map(r => (
                <button key={r.value} type="button" onClick={() => setRoofMaterial(r.value)} className={chipBtn(roofMaterial === r.value)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className={subLabel}>อายุหลังคา <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-3 gap-2">
              {ROOF_AGES.map(a => (
                <button key={a.value} type="button" onClick={() => setRoofAge(a.value)} className={chipBtn(roofAge === a.value)}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className={subLabel}>ทิศหลังคา <span className="text-red-500">*</span> <span className="text-gray-400 normal-case font-normal ml-1">(เลือกได้มากกว่า 1 ทิศ)</span></div>
            <div className="grid grid-cols-3 gap-2">
              {ROOF_ORIENTATIONS.map(o => (
                <button key={o.value} type="button" onClick={() => toggleOrientation(o.value)} className={chipBtn(roofOrientations.includes(o.value))}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className={subLabel}>องศาเอียงหลังคา</div>
            <div className="grid grid-cols-3 gap-2">
              {ROOF_TILTS.map(t => (
                <button key={t} type="button" onClick={() => setRoofTilt(t)} className={chipBtn(roofTilt === t)}>
                  {t}°
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className={subLabel}>พื้นที่หลังคาว่าง <span className="text-red-500">*</span></div>
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                value={roofArea === "" ? "" : roofArea}
                onChange={e => setRoofArea(e.target.value ? parseInt(e.target.value) : "")}
                placeholder="เช่น 40"
                className="w-full h-10 pl-3 pr-12 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">m²</span>
            </div>
          </div>

          <div>
            <div className={subLabel}>เงาบัง</div>
            <div className="grid grid-cols-3 gap-2">
              {SHADING.map(s => (
                <button key={s.value} type="button" onClick={() => setShading(s.value)} className={chipBtn(shading === s.value)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div></>}

      {/* Electrical — phase + grid + utility + CA + meter + DB distance */}
      {(section === "all" || section === "electrical") && <><div className={card}>
        <div className="space-y-4">
          <div>
            <div className={subLabel}>ระบบไฟ <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "1_phase", label: "1 เฟส" },
                { value: "3_phase", label: "3 เฟส" },
              ].map(p => (
                <button key={p.value} type="button" onClick={() => {
                  setElectricalPhase(p.value);
                  onPhaseChange?.(p.value);
                  const valid = METER_SIZES[p.value]?.some(m => m.value === meterSize);
                  if (!valid) setMeterSize("");
                }} className={chipBtn(electricalPhase === p.value)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className={subLabel}>ระบบเชื่อมต่อ <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-3 gap-2">
              {GRID_TYPES.map(g => (
                <button key={g.value} type="button" onClick={() => setGridType(g.value)} className={chipBtn(gridType === g.value)}>
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className={subLabel}>การไฟฟ้า <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-3 gap-2">
              {UTILITIES.map(u => (
                <button key={u.value} type="button" onClick={() => setUtility(u.value)} className={chipBtn(utility === u.value)}>
                  {u.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className={subLabel}>เลขผู้ใช้ไฟ (CA)</div>
            <input
              type="text"
              inputMode="numeric"
              value={caNumber}
              onChange={e => setCaNumber(e.target.value)}
              placeholder="11 หลัก"
              className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
            />
          </div>

          <div>
            <div className={subLabel}>ขนาดมิเตอร์ <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-3 gap-2">
              {(METER_SIZES[electricalPhase] || METER_SIZES["1_phase"]).map(m => (
                <button key={m.value} type="button" onClick={() => setMeterSize(m.value)} className={chipBtn(meterSize === m.value)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className={subLabel}>ระยะ MDB <span className="text-red-500">*</span> → จุดติด Inverter</div>
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                value={dbDistance === "" ? "" : dbDistance}
                onChange={e => setDbDistance(e.target.value ? parseInt(e.target.value) : "")}
                placeholder="เช่น 15"
                className="w-full h-10 pl-3 pr-12 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-medium">m</span>
            </div>
          </div>
        </div>
      </div></>}

      {/* ข้อมูลเพิ่มเติม — AC + Other appliances */}
      {(section === "all" || section === "electrical") && <><div className={card}>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <div className={subLabel}>เครื่องปรับอากาศ</div>
              {totalAc > 0 && (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-600/15 px-1.5 py-0.5 rounded">
                  รวม {totalAc} เครื่อง
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 mb-2">ระบุจำนวนเครื่องตามขนาด BTU</div>
            <div className="space-y-1.5">
              {AC_BTU_SIZES.map(btu => {
                const count = acUnits[btu] || 0;
                return (
                  <div key={btu} className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-gray-700 font-mono tabular-nums">
                      {btu.toLocaleString()} <span className="text-xs text-gray-400 font-sans">BTU</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => updateAc(btu, -1)} disabled={count === 0} className="w-9 h-9 rounded-md border border-gray-200 text-gray-600 text-lg font-semibold disabled:opacity-30 disabled:cursor-not-allowed hover:border-gray-400">−</button>
                      <span className="w-8 text-center text-sm font-bold tabular-nums text-gray-900">{count}</span>
                      <button type="button" onClick={() => updateAc(btu, 1)} className="w-9 h-9 rounded-md border border-gray-200 text-gray-600 text-lg font-semibold hover:border-gray-400">+</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className={subLabel}>เครื่องใช้ไฟฟ้าอื่นๆ</div>
            <div className="grid grid-cols-3 gap-2">
              {APPLIANCES.map(a => (
                <button key={a.value} type="button" onClick={() => toggleAppliance(a.value)} className={chipBtn(appliances.includes(a.value))}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div></>}
    </div>
  );
}
