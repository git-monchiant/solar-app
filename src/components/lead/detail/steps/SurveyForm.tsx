"use client";

import { Fragment, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { apiFetch, getUserIdHeader } from "@/lib/api";
import type { Lead } from "./types";
import FallbackImage from "@/components/ui/FallbackImage";
import { compressImage } from "@/lib/utils/compressImage";
import { MAIN_BREAKER_AMPS, MAIN_CABLE_SQMM } from "@/lib/constants/survey-options";

const chipBtn = (selected: boolean) =>
  `h-8 px-3 rounded-lg text-xxs font-semibold border transition-all cursor-pointer ${
    selected
      ? "bg-active text-white border-active shadow-sm shadow-active/20"
      : "bg-white text-gray-600 border-gray-200 hover:border-active/40 hover:text-active"
  }`;

const ROOF_MATERIALS = [
  { value: "cpac_tile:corrugated", label: "CPAC ลอน" },
  { value: "cpac_tile:smooth", label: "CPAC เรียบ" },
  { value: "old_tile", label: "ลอนคู่" },
  { value: "metal_sheet:bolt", label: "เมทัลชีท ยึดน็อต" },
  { value: "metal_sheet:clip", label: "เมทัลชีท คลิปล็อก" },
  { value: "concrete", label: "ดาดฟ้าคอนกรีต" },
];

const ROOF_ORIENTATIONS = [
  { value: "north", label: "เหนือ" },
  { value: "south", label: "ใต้" },
  { value: "east", label: "ออก" },
  { value: "west", label: "ตก" },
];

const METER_SIZES_ALL = [
  { value: "5_15", label: "5(15) A" },
  { value: "15_45", label: "15(45) A" },
  { value: "30_100", label: "30(100) A" },
];
const METER_SIZES: Record<string, { value: string; label: string }[]> = {
  "1_phase": METER_SIZES_ALL,
  "3_phase": METER_SIZES_ALL,
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

const ROOF_TILTS = [15, 25, 35, 180];

export interface SurveyFormHandle {
  flushSave: () => Promise<void>;
}

interface Props {
  lead: Lead;
  refresh: () => void;
  section?: "house" | "electrical" | "prep" | "all";
  onPhaseChange?: (phase: string) => void;
  onFormChange?: (data: Partial<Lead>) => void;
}

const SurveyForm = forwardRef<SurveyFormHandle, Props>(function SurveyForm({ lead, refresh, section = "all", onPhaseChange, onFormChange }, ref) {
  // Must-have on-site
  const [roofMaterial, setRoofMaterial] = useState<string>(lead.survey_roof_material ?? "");
  const [roofOrientations, setRoofOrientations] = useState<string[]>(
    (lead.survey_roof_orientation ?? "").split(",").filter(Boolean)
  );
  // Per-direction remarks (north/south/east/west). Stored on the lead as a
  // JSON object string in survey_roof_orientation_notes; surface it as a flat
  // record locally so input handlers stay simple.
  const [roofOrientationNotes, setRoofOrientationNotes] = useState<Record<string, string>>(() => {
    try {
      const parsed = JSON.parse(lead.survey_roof_orientation_notes ?? "{}");
      return typeof parsed === "object" && parsed ? parsed : {};
    } catch { return {}; }
  });
  const toggleOrientation = (v: string) =>
    setRoofOrientations(prev => {
      const next = prev.includes(v) ? prev.filter(o => o !== v) : [...prev, v];
      // Drop the remark for a direction the surveyor just turned off so it
      // doesn't get re-saved if they toggle back later.
      if (!next.includes(v)) {
        setRoofOrientationNotes(curr => {
          if (!(v in curr)) return curr;
          const { [v]: _drop, ...rest } = curr;
          return rest;
        });
      }
      return next;
    });
  const [floors, setFloors] = useState<number | null>(lead.survey_floors ?? null);
  const [roofArea, setRoofArea] = useState<number | "">(lead.survey_roof_area_m2 ?? "");
  const [meterSize, setMeterSize] = useState<string>(lead.survey_meter_size ?? "");
  const [dbDistance, setDbDistance] = useState<number | "">(lead.survey_db_distance_m ?? "");

  // Nice-to-have
  const [shading, setShading] = useState<string>(lead.survey_shading ?? "");
  const [roofTilt, setRoofTilt] = useState<number | null>(lead.survey_roof_tilt ?? null);

  const [electricalPhase, setElectricalPhase] = useState<string>(lead.survey_electrical_phase ?? lead.pre_electrical_phase ?? "");

  // PDF — section 2 (Electrical)
  const [voltageLN, setVoltageLN] = useState<number | "">(lead.survey_voltage_ln ?? "");
  const [voltageLL, setVoltageLL] = useState<number | "">(lead.survey_voltage_ll ?? "");
  const [mdbBrand, setMdbBrand] = useState<string>(lead.survey_mdb_brand ?? "");
  const [mdbModel, setMdbModel] = useState<string>(lead.survey_mdb_model ?? "");
  const [mdbSlots, setMdbSlots] = useState<string>(lead.survey_mdb_slots ?? "has_slot");
  const [breakerType, setBreakerType] = useState<string>(lead.survey_breaker_type ?? "");
  const [mainBreakerAmp, setMainBreakerAmp] = useState<string>(lead.survey_main_breaker_amp ?? "");
  const [mainCableSqmm, setMainCableSqmm] = useState<string>(lead.survey_main_cable_sqmm ?? "");
  const [panelToInverterM, setPanelToInverterM] = useState<number | "">(lead.survey_panel_to_inverter_m ?? "");
  // PDF — section 3 (Roof structure)
  const [roofStructure, setRoofStructure] = useState<string>(lead.survey_roof_structure ?? "");
  const [roofWidth, setRoofWidth] = useState<number | "">(lead.survey_roof_width_m ?? "");
  const [roofLength, setRoofLength] = useState<number | "">(lead.survey_roof_length_m ?? "");
  // PDF — section 4 (Installation planning)
  const [inverterLocation, setInverterLocation] = useState<string>(lead.survey_inverter_location ?? "");
  const [wifiSignal, setWifiSignal] = useState<string>(lead.survey_wifi_signal ?? "");
  const [accessMethod, setAccessMethod] = useState<string>(lead.survey_access_method ?? "");
  // PDF — section 5 Photo Checklist (named slots)
  const [photoBuilding, setPhotoBuilding] = useState<string | null>(lead.survey_photo_building_url ?? null);
  const [photoRoofStructure, setPhotoRoofStructure] = useState<string | null>(lead.survey_photo_roof_structure_url ?? null);
  const [photoMdb, setPhotoMdb] = useState<string | null>(lead.survey_photo_mdb_url ?? null);
  const [photoInverterPoint, setPhotoInverterPoint] = useState<string | null>(lead.survey_photo_inverter_point_url ?? null);
  const [layoutSketch, setLayoutSketch] = useState<string | null>(lead.survey_layout_sketch_url ?? null);
  type PhotoSlotKey = "building" | "roof_structure" | "mdb" | "inverter_point" | "layout_sketch";
  type PhotoSlotField = "survey_photo_building_url" | "survey_photo_roof_structure_url" | "survey_photo_mdb_url" | "survey_photo_inverter_point_url" | "survey_layout_sketch_url";
  const [uploadingSlot, setUploadingSlot] = useState<PhotoSlotKey | null>(null);

  const uploadPhotoSlot = async (file: File, field: PhotoSlotField, setLocal: (url: string | null) => void, slot: PhotoSlotKey) => {
    setUploadingSlot(slot);
    try {
      const compressed = await compressImage(file).catch(() => file);
      const fd = new FormData();
      fd.append("file", compressed);
      fd.append("filename", `lead${lead.id}_${slot}_${Date.now()}`);
      const res = await fetch("/api/upload", { method: "POST", body: fd, headers: { "ngrok-skip-browser-warning": "true", ...getUserIdHeader() } });
      const { url } = await res.json();
      if (url) {
        setLocal(url);
        await apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: url }) });
        // Refresh parent so the validator's gate check sees the new URL — without
        // this, lead.survey_photo_*_url stays null in memory and "ถัดไป" fails.
        refresh();
      }
    } finally { setUploadingSlot(null); }
  };

  // Photo-with-Note section — dynamic captioned slots stored as a JSON array
  // in survey_photo_notes. Always renders PHOTO_NOTES_MAX fixed slots — the
  // surveyor fills any of them in; no "+" button needed.
  const PHOTO_NOTES_MAX = 4;
  type PhotoNote = { url: string | null; note: string };
  const initPhotoNotes = (): PhotoNote[] => {
    let parsed: PhotoNote[] = [];
    try {
      const raw = lead.survey_photo_notes;
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) parsed = arr.map(it => ({ url: it?.url ?? null, note: it?.note ?? "" }));
      }
    } catch {}
    // Pad to fixed length so the grid always shows MAX slots up-front.
    while (parsed.length < PHOTO_NOTES_MAX) parsed.push({ url: null, note: "" });
    return parsed.slice(0, PHOTO_NOTES_MAX);
  };
  const [photoNotes, setPhotoNotes] = useState<PhotoNote[]>(initPhotoNotes);
  const [uploadingPhotoNoteIdx, setUploadingPhotoNoteIdx] = useState<number | null>(null);
  const updatePhotoNote = (idx: number, patch: Partial<PhotoNote>) =>
    setPhotoNotes(curr => curr.map((p, i) => i === idx ? { ...p, ...patch } : p));
  const uploadPhotoNote = async (file: File, idx: number) => {
    setUploadingPhotoNoteIdx(idx);
    try {
      const compressed = await compressImage(file).catch(() => file);
      const fd = new FormData();
      fd.append("file", compressed);
      fd.append("filename", `lead${lead.id}_note${idx + 1}_${Date.now()}`);
      const res = await fetch("/api/upload", { method: "POST", body: fd, headers: { "ngrok-skip-browser-warning": "true", ...getUserIdHeader() } });
      const { url } = await res.json();
      if (url) updatePhotoNote(idx, { url });
    } finally { setUploadingPhotoNoteIdx(null); }
  };

  // Duplicates of pre_* (default from pre_*)
  const [monthlyBill, setMonthlyBill] = useState<number | "">(lead.survey_monthly_bill ?? lead.pre_monthly_bill ?? "");
  const [appliances, setAppliances] = useState<string[]>(
    (lead.survey_appliances ?? lead.pre_appliances ?? "").split(",").filter(Boolean)
  );
  const toggleAppliance = (v: string) => setAppliances(prev => prev.includes(v) ? prev.filter(a => a !== v) : [...prev, v]);

  // Payload builder — returns ONLY fields relevant to the current section.
  // Critical: SurveyForm is mounted per-subStep, and state inits from lead
  // prop (which may be stale if parent hasn't refreshed). Sending all fields
  // would overwrite the previous section's saved values with stale NULLs.
  const buildPayload = (): Partial<Lead> => {
    const electrical = {
      survey_meter_size: meterSize || null,
      survey_electrical_phase: electricalPhase || null,
      survey_voltage_ln: typeof voltageLN === "number" ? voltageLN : null,
      survey_voltage_ll: typeof voltageLL === "number" ? voltageLL : null,
      survey_monthly_bill: typeof monthlyBill === "number" ? monthlyBill : null,
      survey_mdb_brand: mdbBrand || null,
      survey_mdb_model: mdbModel || null,
      survey_mdb_slots: mdbSlots || null,
      survey_breaker_type: breakerType || null,
      survey_main_breaker_amp: mainBreakerAmp || null,
      survey_main_cable_sqmm: mainCableSqmm || null,
      survey_panel_to_inverter_m: typeof panelToInverterM === "number" ? panelToInverterM : null,
      survey_db_distance_m: typeof dbDistance === "number" ? dbDistance : null,
      survey_appliances: appliances.length ? appliances.join(",") : null,
    };
    const house = {
      survey_roof_material: roofMaterial || null,
      survey_roof_orientation: roofOrientations.length ? roofOrientations.join(",") : null,
      survey_roof_orientation_notes: Object.keys(roofOrientationNotes).length ? JSON.stringify(roofOrientationNotes) : null,
      survey_floors: floors,
      survey_roof_area_m2: typeof roofArea === "number" ? roofArea : null,
      survey_roof_tilt: roofTilt,
      survey_roof_width_m: typeof roofWidth === "number" ? roofWidth : null,
      survey_roof_length_m: typeof roofLength === "number" ? roofLength : null,
      survey_roof_structure: roofStructure || null,
      survey_shading: shading || null,
    };
    const prep = {
      survey_inverter_location: inverterLocation || null,
      survey_wifi_signal: wifiSignal || null,
      survey_access_method: accessMethod || null,
      // Photo-with-note lives on the prep/photo section. Drop empty trailing
      // entries so a row with both url=null and note="" doesn't take up space
      // in the DB after a save.
      survey_photo_notes: (() => {
        const cleaned = photoNotes.map(p => ({ url: p.url, note: (p.note ?? "").trim() }));
        const lastFilled = cleaned.reduce((last, p, i) => (p.url || p.note) ? i : last, -1);
        if (lastFilled < 0) return null;
        return JSON.stringify(cleaned.slice(0, lastFilled + 1));
      })(),
    };
    if (section === "electrical") return electrical;
    if (section === "house") return house;
    if (section === "prep") return prep;
    return { ...electrical, ...house, ...prep };
  };

  // Sync parent state immediately so validation sees latest values
  useEffect(() => {
    onFormChange?.(buildPayload());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roofMaterial, roofOrientations, roofOrientationNotes, floors, roofArea, meterSize, dbDistance, shading, roofTilt, monthlyBill, appliances, electricalPhase, voltageLN, voltageLL, mdbBrand, mdbModel, mdbSlots, breakerType, mainBreakerAmp, mainCableSqmm, panelToInverterM, roofStructure, roofWidth, roofLength, inverterLocation, wifiSignal, accessMethod, photoNotes]);

  // Auto-save to DB (debounced). Pending payload lives in a ref so it can
  // flush on unmount — otherwise navigating between SurveyForm sections within
  // 600ms of a change cancels the save and loses data.
  const isFirst = useRef(true);
  const pendingRef = useRef<{ payload: Partial<Lead>; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    const payload = buildPayload();
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
  }, [roofMaterial, roofOrientations, roofOrientationNotes, floors, roofArea, meterSize, dbDistance, shading, roofTilt, monthlyBill, appliances, electricalPhase, voltageLN, voltageLL, mdbBrand, mdbModel, mdbSlots, breakerType, mainBreakerAmp, mainCableSqmm, panelToInverterM, roofStructure, roofWidth, roofLength, inverterLocation, wifiSignal, accessMethod, photoNotes]);

  // Flush any pending debounced save when this section unmounts (e.g. user
  // navigates subStep before the 600ms timer fires).
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

  const card = "rounded-lg bg-white/60 border border-active/15 p-3";

  const subLabel = "text-xs font-semibold tracking-wider uppercase text-gray-400 block mb-2";

  return (
    <div className="space-y-2">
      {/* =============== §2 Electrical — PDF top-down order =============== */}
      {(section === "all" || section === "electrical") && <><div className={card}>
        <div className="space-y-4">
          {/* 2.1 ขนาดมิเตอร์.
              "อื่นๆ ระบุ" sits in the remaining grid cells on the same row.
              METER_SIZES has 3 chips per phase → md:col-span-4 fills cols 4-7. */}
          <div>
            <div className={subLabel}>ขนาดมิเตอร์ <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {(METER_SIZES[electricalPhase] || METER_SIZES["1_phase"]).map(m => (
                <button key={m.value} type="button" onClick={() => setMeterSize(m.value)} className={chipBtn(meterSize === m.value)}>
                  {m.label}
                </button>
              ))}
              <input
                type="text"
                placeholder="อื่นๆ ระบุ..."
                value={meterSize.startsWith("other:") ? meterSize.slice(6) : ""}
                onChange={e => setMeterSize(e.target.value ? `other:${e.target.value}` : "")}
                className={`col-span-1 md:col-span-4 w-full h-8 px-3 rounded-lg border text-sm focus:outline-none ${meterSize.startsWith("other") ? "border-active bg-active-light" : "border-gray-200 bg-white"}`}
              />
            </div>
          </div>

          {/* 2.2 เฟส / แรงดัน — chip + voltage input. Two rows in 7-col grid:
              chip md:col-span-1, voltage label+input md:col-span-6. */}
          <div>
            <div className={subLabel}>เฟส / แรงดัน <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-[1fr_3fr] md:grid-cols-7 gap-2 items-center">
              <button type="button" onClick={() => {
                setElectricalPhase("1_phase");
                onPhaseChange?.("1_phase");
                const valid = METER_SIZES["1_phase"]?.some(m => m.value === meterSize);
                if (!valid) setMeterSize("");
                setVoltageLL("");
              }} className={`md:col-span-1 ${chipBtn(electricalPhase === "1_phase")}`}>
                1 เฟส
              </button>
              <div className="md:col-span-6 flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-500 shrink-0">L-N</span>
                <div className="relative flex-1">
                  <input type="number" step="0.1" value={voltageLN === "" ? "" : voltageLN} onChange={e => setVoltageLN(e.target.value === "" ? "" : parseFloat(e.target.value))} placeholder="220" disabled={electricalPhase !== "1_phase"} className="w-full h-8 pl-3 pr-8 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary disabled:bg-gray-50 disabled:text-gray-400" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">V</span>
                </div>
              </div>

              <button type="button" onClick={() => {
                setElectricalPhase("3_phase");
                onPhaseChange?.("3_phase");
                const valid = METER_SIZES["3_phase"]?.some(m => m.value === meterSize);
                if (!valid) setMeterSize("");
                setVoltageLN("");
              }} className={`md:col-span-1 ${chipBtn(electricalPhase === "3_phase")}`}>
                3 เฟส
              </button>
              <div className="md:col-span-6 flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-500 shrink-0">L-L</span>
                <div className="relative flex-1">
                  <input type="number" step="0.1" value={voltageLL === "" ? "" : voltageLL} onChange={e => setVoltageLL(e.target.value === "" ? "" : parseFloat(e.target.value))} placeholder="380" disabled={electricalPhase !== "3_phase"} className="w-full h-8 pl-3 pr-8 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary disabled:bg-gray-50 disabled:text-gray-400" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">V</span>
                </div>
              </div>
            </div>
          </div>

          {/* 2.4 ค่าไฟเฉลี่ยต่อเดือน — number input occupies 1/7 cell so it
              lines up with chip widths above. */}
          <div>
            <div className={subLabel}>ค่าไฟเฉลี่ยต่อเดือน <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              <div className="relative col-span-1">
                <input
                  type="number"
                  inputMode="numeric"
                  value={monthlyBill === "" ? "" : monthlyBill}
                  onChange={e => setMonthlyBill(e.target.value ? parseInt(e.target.value) : "")}
                  placeholder="เช่น 3,500"
                  className="w-full h-8 pl-3 pr-12 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium">บาท</span>
              </div>
            </div>
          </div>

          {/* 2.5 + 2.6 Consumer Unit / MDB + ช่องว่าง (checkbox) */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              {/* nowrap + drop tracking-wider — uppercase tracking-wider blew up
                  the width on mobile and forced the asterisk onto its own line. */}
              <div className="text-xs font-semibold uppercase text-gray-400 whitespace-nowrap">Consumer Unit / MDB <span className="text-red-500">*</span></div>
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={mdbSlots === "has_slot"}
                  onChange={e => setMdbSlots(e.target.checked ? "has_slot" : "full")}
                  className="w-4 h-4 rounded border-gray-300 accent-active"
                />
                <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">มีช่องว่าง</span>
              </label>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              <label className="md:col-span-2 flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">ยี่ห้อ</span>
                <input type="text" value={mdbBrand} onChange={e => setMdbBrand(e.target.value)} className="h-8 px-3 rounded-lg border border-gray-200 text-sm" />
              </label>
              <label className="md:col-span-2 flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-500">รุ่น</span>
                <input type="text" value={mdbModel} onChange={e => setMdbModel(e.target.value)} className="h-8 px-3 rounded-lg border border-gray-200 text-sm" />
              </label>
            </div>
          </div>

          {/* 2.7 ชนิดของลูกเซอร์กิต.
              2 chips → "อื่นๆ ระบุ" fills remaining md:col-span-5. */}
          <div>
            <div className={subLabel}>ชนิดของลูกเซอร์กิต <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {[
                { value: "plug_on", label: "Plug On" },
                { value: "screw", label: "ขันยึดสกรู" },
              ].map(b => (
                <button key={b.value} type="button" onClick={() => setBreakerType(breakerType === b.value ? "" : b.value)} className={chipBtn(breakerType === b.value)}>
                  {b.label}
                </button>
              ))}
              <input
                type="text"
                placeholder="อื่นๆ ระบุ..."
                value={breakerType.startsWith("other:") ? breakerType.slice(6) : ""}
                onChange={e => setBreakerType(e.target.value ? `other:${e.target.value}` : "")}
                onFocus={() => { if (!breakerType.startsWith("other")) setBreakerType("other:"); }}
                className={`col-span-1 md:col-span-5 w-full h-8 px-3 rounded-lg border text-sm focus:outline-none ${breakerType.startsWith("other") ? "border-active bg-active-light" : "border-gray-200 bg-white"}`}
              />
            </div>
          </div>

          {/* ขนาดเมนเบรกเกอร์ — 4 chips → "อื่นๆ ระบุ" fills md:col-span-3. */}
          <div>
            <div className={subLabel}>ขนาดเมนเบรกเกอร์</div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {MAIN_BREAKER_AMPS.map(a => (
                <button key={a} type="button" onClick={() => setMainBreakerAmp(mainBreakerAmp === a ? "" : a)} className={chipBtn(mainBreakerAmp === a)}>
                  {a} A
                </button>
              ))}
              <input
                type="text"
                placeholder="อื่นๆ ระบุ..."
                value={mainBreakerAmp.startsWith("other:") ? mainBreakerAmp.slice(6) : ""}
                onChange={e => setMainBreakerAmp(e.target.value ? `other:${e.target.value}` : "")}
                onFocus={() => { if (!mainBreakerAmp.startsWith("other")) setMainBreakerAmp("other:"); }}
                className={`col-span-1 md:col-span-3 w-full h-8 px-3 rounded-lg border text-sm focus:outline-none ${mainBreakerAmp.startsWith("other") ? "border-active bg-active-light" : "border-gray-200 bg-white"}`}
              />
            </div>
          </div>

          {/* ขนาดสายเมน — 4 chips → "อื่นๆ ระบุ" fills md:col-span-3. */}
          <div>
            <div className={subLabel}>ขนาดสายเมน (sq.mm)</div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {MAIN_CABLE_SQMM.map(s => (
                <button key={s} type="button" onClick={() => setMainCableSqmm(mainCableSqmm === s ? "" : s)} className={chipBtn(mainCableSqmm === s)}>
                  {s}
                </button>
              ))}
              <input
                type="text"
                placeholder="อื่นๆ ระบุ..."
                value={mainCableSqmm.startsWith("other:") ? mainCableSqmm.slice(6) : ""}
                onChange={e => setMainCableSqmm(e.target.value ? `other:${e.target.value}` : "")}
                onFocus={() => { if (!mainCableSqmm.startsWith("other")) setMainCableSqmm("other:"); }}
                className={`col-span-1 md:col-span-3 w-full h-8 px-3 rounded-lg border text-sm focus:outline-none ${mainCableSqmm.startsWith("other") ? "border-active bg-active-light" : "border-gray-200 bg-white"}`}
              />
            </div>
          </div>

          {/* 2.8 Cable (PV → Inverter) — 1/7 input cell */}
          <div>
            <div className={subLabel}>Cable (PV → Inverter) <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              <div className="relative col-span-1">
                <input
                  type="number"
                  step="0.5"
                  inputMode="numeric"
                  value={panelToInverterM === "" ? "" : panelToInverterM}
                  onChange={e => setPanelToInverterM(e.target.value === "" ? "" : parseFloat(e.target.value))}
                  placeholder="เช่น 15"
                  className="w-full h-8 pl-3 pr-10 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium">m</span>
              </div>
            </div>
          </div>

          {/* 2.9 Cable (Inverter → MDB) */}
          <div>
            <div className={subLabel}>Cable (Inverter → MDB) <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              <div className="relative col-span-1">
                <input
                  type="number"
                  inputMode="numeric"
                  value={dbDistance === "" ? "" : dbDistance}
                  onChange={e => setDbDistance(e.target.value ? parseInt(e.target.value) : "")}
                  placeholder="เช่น 15"
                  className="w-full h-8 pl-3 pr-10 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium">m</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* EV charger — single checkbox-style toggle */}
      <div className={card}>
        <div className="space-y-4">
          <div>
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={appliances.includes("ev")}
                onChange={() => toggleAppliance("ev")}
                className="w-4 h-4 rounded border-gray-300 accent-active"
              />
              <span className="text-sm font-semibold text-gray-700">มีจุดชาร์จรถ EV</span>
            </label>
          </div>
        </div>
      </div></>}

      {/* =============== §3 Roof — PDF top-down order =============== */}
      {(section === "all" || section === "house") && <><div className={card}>
        <div className="space-y-4">
          {/* 3.1 ประเภทหลังคา */}
          <div>
            <div className={subLabel}>ประเภทหลังคา <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {ROOF_MATERIALS.map(r => (
                <button key={r.value} type="button" onClick={() => setRoofMaterial(r.value)} className={chipBtn(roofMaterial === r.value)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* มุมลาดเอียงหลังคา */}
          <div>
            <div className={subLabel}>มุมลาดเอียงหลังคา <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {ROOF_TILTS.map(t => (
                <button key={t} type="button" onClick={() => setRoofTilt(t)} className={chipBtn(roofTilt === t)}>
                  {t}°
                </button>
              ))}
            </div>
          </div>

          {/* 3.2 โครงสร้างหลังคา — 3 chips + "อื่นๆ" inline (md:col-span-4). */}
          <div>
            <div className={subLabel}>โครงสร้างหลังคา <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {[
                { value: "steel", label: "เหล็ก" },
                { value: "wood", label: "ไม้" },
                { value: "aluminum", label: "อลูมิเนียม" },
              ].map(b => (
                <button key={b.value} type="button" onClick={() => setRoofStructure(roofStructure === b.value ? "" : b.value)} className={chipBtn(roofStructure === b.value)}>
                  {b.label}
                </button>
              ))}
              <input
                type="text"
                placeholder="อื่นๆ ระบุ..."
                value={roofStructure.startsWith("other:") ? roofStructure.slice(6) : ""}
                onChange={e => setRoofStructure(e.target.value ? `other:${e.target.value}` : "")}
                onFocus={() => { if (!roofStructure.startsWith("other")) setRoofStructure("other:"); }}
                className={`col-span-1 md:col-span-4 w-full h-8 px-3 rounded-lg border text-sm focus:outline-none ${roofStructure.startsWith("other") ? "border-active bg-active-light" : "border-gray-200 bg-white"}`}
              />
            </div>
          </div>

          {/* 3.3 ทิศทางการวางแผง — chip + note input pair per direction. In
               7-col grid: chip md:col-span-1, note input md:col-span-6, so
               each direction occupies a full row. */}
          <div>
            <div className={subLabel}>ทิศทางการวางแผง <span className="text-red-500">*</span> <span className="text-gray-400 normal-case font-normal ml-1">(เลือกได้มากกว่า 1 ทิศ)</span></div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2 items-center">
              {ROOF_ORIENTATIONS.map(o => {
                const selected = roofOrientations.includes(o.value);
                return (
                  <Fragment key={o.value}>
                    <button type="button" onClick={() => toggleOrientation(o.value)} className={`md:col-span-1 ${chipBtn(selected)}`}>
                      {o.label}
                    </button>
                    <input
                      type="text"
                      value={roofOrientationNotes[o.value] ?? ""}
                      onChange={e => setRoofOrientationNotes(curr => ({ ...curr, [o.value]: e.target.value }))}
                      placeholder="หมายเหตุ (ถ้ามี)"
                      disabled={!selected}
                      className="md:col-span-6 w-full h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </Fragment>
                );
              })}
            </div>
          </div>

          {/* 3.4 ความสูงอาคาร (ชั้น) */}
          <div>
            <div className={subLabel}>ความสูงอาคาร (ชั้น) <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {FLOORS.map(f => (
                <button key={f.value} type="button" onClick={() => setFloors(f.value)} className={chipBtn(floors === f.value)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3.6 พื้นที่หลังคา (m²) + กว้าง × ยาว (m). Area + W + L = 3 cells
               in the 7-col grid, each col-span-1. */}
          <div>
            <div className={subLabel}>พื้นที่หลังคาที่ใช้ได้จริง <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              <div className="relative col-span-2 md:col-span-1">
                <input
                  type="number"
                  inputMode="numeric"
                  value={roofArea === "" ? "" : roofArea}
                  onChange={e => setRoofArea(e.target.value ? parseInt(e.target.value) : "")}
                  placeholder="เช่น 40"
                  className="w-full h-8 pl-3 pr-10 rounded-lg border border-gray-200 bg-white text-sm font-mono tabular-nums focus:outline-none focus:border-primary"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium">m²</span>
              </div>
              <div className="input-affix col-span-1">
                <span className="input-affix-left">W</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={roofWidth === "" ? "" : roofWidth}
                  onChange={e => {
                    const digits = e.target.value.replace(/[^\d]/g, "");
                    setRoofWidth(digits === "" ? "" : parseInt(digits));
                  }}
                  className="input-affix-input w-full h-8 pl-8 pr-7 rounded-lg border border-gray-200 text-sm"
                />
                <span className="input-affix-right">m</span>
              </div>
              <div className="input-affix col-span-1">
                <span className="input-affix-left">L</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={roofLength === "" ? "" : roofLength}
                  onChange={e => {
                    const digits = e.target.value.replace(/[^\d]/g, "");
                    setRoofLength(digits === "" ? "" : parseInt(digits));
                  }}
                  className="input-affix-input w-full h-8 pl-8 pr-7 rounded-lg border border-gray-200 text-sm"
                />
                <span className="input-affix-right">m</span>
              </div>
            </div>
          </div>

          {/* 3.7 สิ่งกีดขวาง / ร่มเงา. SHADING has 3 chips → อื่นๆ md:col-span-4. */}
          <div>
            <div className={subLabel}>สิ่งกีดขวาง / ร่มเงา <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {SHADING.map(s => (
                <button key={s.value} type="button" onClick={() => setShading(shading.startsWith(s.value + ":") || shading === s.value ? s.value : s.value)} className={chipBtn(shading === s.value || shading.startsWith(s.value + ":"))}>
                  {s.label}
                </button>
              ))}
              <input
                type="text"
                placeholder="ระบุสิ่งกีดขวาง..."
                value={shading.includes(":") ? shading.split(":").slice(1).join(":") : ""}
                onChange={e => {
                  const base = shading.includes(":") ? shading.split(":")[0] : (shading || "partial");
                  setShading(e.target.value ? `${base}:${e.target.value}` : base);
                }}
                className="col-span-1 md:col-span-4 w-full h-8 px-3 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

        </div>
      </div>

      </>}

      {/* PDF §4 — การเตรียมการติดตั้ง (Installation Planning) */}
      {(section === "all" || section === "prep") && <><div className={card}>
        <div className="space-y-4">
          <div>
            <div className={subLabel}>จุดติดตั้ง Inverter <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {[
                { value: "indoor", label: "ในร่ม" },
                { value: "outdoor", label: "นอกอาคาร" },
              ].map(b => (
                <button key={b.value} type="button" onClick={() => setInverterLocation(inverterLocation === b.value ? "" : b.value)} className={chipBtn(inverterLocation === b.value)}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className={subLabel}>ความแรง Wi-Fi <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {[
                { value: "good", label: "ดีมาก" },
                { value: "fair", label: "พอใช้" },
                { value: "none", label: "ยังไม่มี" },
              ].map(b => (
                <button key={b.value} type="button" onClick={() => setWifiSignal(wifiSignal === b.value ? "" : b.value)} className={chipBtn(wifiSignal === b.value)}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
          {/* วิธีการขึ้นชั้นหลังคา — 3 chips + "อื่นๆ ระบุ" inline (md:col-span-4). */}
          <div>
            <div className={subLabel}>วิธีการขึ้นชั้นหลังคา <span className="text-red-500">*</span></div>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {[
                { value: "ladder", label: "บันไดพาด" },
                { value: "scaffold", label: "นั่งร้าน" },
                { value: "crane", label: "รถกระเช้า" },
              ].map(b => (
                <button key={b.value} type="button" onClick={() => setAccessMethod(accessMethod === b.value ? "" : b.value)} className={chipBtn(accessMethod === b.value)}>
                  {b.label}
                </button>
              ))}
              <input
                type="text"
                placeholder="อื่นๆ ระบุ..."
                value={accessMethod.startsWith("other:") ? accessMethod.slice(6) : ""}
                onChange={e => setAccessMethod(e.target.value ? `other:${e.target.value}` : "")}
                onFocus={() => { if (!accessMethod.startsWith("other")) setAccessMethod("other:"); }}
                className={`col-span-1 md:col-span-4 w-full h-8 px-3 rounded-lg border text-sm focus:outline-none ${accessMethod.startsWith("other") ? "border-active bg-active-light" : "border-gray-200 bg-white"}`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* PDF §5 Photo Checklist — separate card */}
      <div className={card}>
        <div className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">รูปตามรายการ</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: "building" as const, url: photoBuilding, set: setPhotoBuilding, field: "survey_photo_building_url" as const, label: "รูปถ่ายอาคาร ให้เห็นหลังคา" },
            { key: "roof_structure" as const, url: photoRoofStructure, set: setPhotoRoofStructure, field: "survey_photo_roof_structure_url" as const, label: "รูปโครงสร้างใต้หลังคา" },
            { key: "mdb" as const, url: photoMdb, set: setPhotoMdb, field: "survey_photo_mdb_url" as const, label: "รูปเปิดตู้ไฟเมน ให้เห็นเบรคเกอร์ชัดเจน" },
            { key: "inverter_point" as const, url: photoInverterPoint, set: setPhotoInverterPoint, field: "survey_photo_inverter_point_url" as const, label: "รูปจุดที่จะติดตั้ง Inverter" },
          ].map(slot => (
            <div key={slot.key} className="flex flex-col">
              <div className={`${subLabel} min-h-[2.5em] leading-snug`}>{slot.label}</div>
              {/* Two file inputs feed the same handler — capture=environment
                   opens the camera; the bare one opens the gallery. UI shows
                   two icon-only buttons instead of relying on the browser's
                   native picker, which on some Android builds only surfaces
                   one option. */}
              <input
                id={`photo-${slot.key}-cam-${lead.id}`}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadPhotoSlot(f, slot.field, slot.set, slot.key);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <input
                id={`photo-${slot.key}-lib-${lead.id}`}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadPhotoSlot(f, slot.field, slot.set, slot.key);
                  e.target.value = "";
                }}
                className="hidden"
              />
              {slot.url ? (
                <div className="relative aspect-video">
                  <FallbackImage src={slot.url} alt={slot.label} lightboxLabel={slot.label} className="w-full h-full object-cover rounded-lg border border-gray-200" fallbackLabel="รูปหาย" />
                  <button
                    type="button"
                    onClick={async () => {
                      slot.set(null);
                      await apiFetch(`/api/leads/${lead.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [slot.field]: null }) });
                    }}
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shadow"
                  >×</button>
                </div>
              ) : (
                <div className="h-28 rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center gap-12 text-gray-500">
                  {uploadingSlot === slot.key ? (
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-active rounded-full animate-spin" />
                  ) : (
                    <>
                      <button type="button" onClick={() => document.getElementById(`photo-${slot.key}-cam-${lead.id}`)?.click()} title="ถ่ายรูป" className="hover:text-active transition-colors cursor-pointer">
                        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>
                      </button>
                      <button type="button" onClick={() => document.getElementById(`photo-${slot.key}-lib-${lead.id}`)?.click()} title="แนบรูป" className="hover:text-active transition-colors cursor-pointer">
                        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Dedicated source image for PDF page 5: Equipment Layout Sketch. */}
      <div className={card}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <div className="text-sm font-bold text-gray-700 uppercase tracking-wider">ผังร่างจุดติดตั้งอุปกรณ์</div>
            <p className="text-xs text-gray-400 mt-1">ถ่ายรูปผังที่วาดบนกระดาษ หรือเลือกไฟล์รูปจากเครื่อง เพื่อแสดงในรายงาน PDF</p>
          </div>
          {layoutSketch && <span className="shrink-0 text-xs font-semibold text-emerald-600">แนบแล้ว</span>}
        </div>
        <input
          id={`photo-layout-sketch-cam-${lead.id}`}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadPhotoSlot(f, "survey_layout_sketch_url", setLayoutSketch, "layout_sketch");
            e.target.value = "";
          }}
          className="hidden"
        />
        <input
          id={`photo-layout-sketch-lib-${lead.id}`}
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadPhotoSlot(f, "survey_layout_sketch_url", setLayoutSketch, "layout_sketch");
            e.target.value = "";
          }}
          className="hidden"
        />
        {layoutSketch ? (
          <div className="relative rounded-lg border border-gray-200 bg-white p-2">
            <FallbackImage
              src={layoutSketch}
              alt="ผังร่างจุดติดตั้งอุปกรณ์"
              lightboxLabel="ผังร่างจุดติดตั้งอุปกรณ์"
              className="w-full max-h-80 object-contain rounded-md bg-gray-50"
              fallbackLabel="รูปผังร่างหาย"
            />
            <button
              type="button"
              title="ลบรูปผังร่าง"
              onClick={async () => {
                setLayoutSketch(null);
                await apiFetch(`/api/leads/${lead.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ survey_layout_sketch_url: null }),
                });
                refresh();
              }}
              className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shadow"
            >×</button>
          </div>
        ) : (
          <div className="min-h-36 rounded-lg border border-dashed border-gray-300 bg-white flex flex-col items-center justify-center gap-3 px-4 py-6 text-gray-500">
            {uploadingSlot === "layout_sketch" ? (
              <div className="w-6 h-6 border-2 border-gray-300 border-t-active rounded-full animate-spin" />
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => document.getElementById(`photo-layout-sketch-cam-${lead.id}`)?.click()}
                  className="h-9 px-4 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:border-active hover:text-active transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>
                  ถ่ายรูป
                </button>
                <button
                  type="button"
                  onClick={() => document.getElementById(`photo-layout-sketch-lib-${lead.id}`)?.click()}
                  className="h-9 px-4 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:border-active hover:text-active transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" /></svg>
                  เลือกรูปจากเครื่อง
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Photo with Note — dynamic captioned slots, 1 by default, up to 5.
           "+" adds a row; "×" removes one (collapses back to a single empty
           row if the surveyor deletes the last). Stored as JSON; trailing
           empty rows are dropped on save (see buildPayload). */}
      <div className={card}>
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold text-gray-700 uppercase tracking-wider">รูปพร้อมหมายเหตุ</div>
          <span className="text-xs text-gray-400">{photoNotes.length} / {PHOTO_NOTES_MAX}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {photoNotes.map((p, idx) => (
            <div key={idx} className="relative rounded-lg border border-gray-200 bg-white/60 p-2 space-y-2">
              {/* Same dual-input pattern as Photo Checklist: programmatic
                   .click() avoids the Android Chrome label-routing quirk. */}
              <input id={`photo-note-${idx}-cam-${lead.id}`} type="file" accept="image/*" capture="environment" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhotoNote(f, idx); e.target.value = ""; }} className="hidden" />
              <input id={`photo-note-${idx}-lib-${lead.id}`} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhotoNote(f, idx); e.target.value = ""; }} className="hidden" />
              {/* Slot is fixed — only allow clearing the photo+note back to
                   empty (not removing the slot entirely). Hidden when empty. */}
              {(p.url || p.note) && (
                <button
                  type="button"
                  onClick={() => updatePhotoNote(idx, { url: null, note: "" })}
                  title="ล้าง"
                  className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs shadow z-10"
                >×</button>
              )}
              {p.url ? (
                <div className="relative">
                  <FallbackImage src={p.url} alt={`Photo ${idx + 1}`} lightboxLabel={p.note || `Photo ${idx + 1}`} className="w-full h-auto rounded-lg border border-gray-200 block" fallbackLabel="รูปหาย" />
                </div>
              ) : (
                <div className="h-28 rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center gap-12 text-gray-500">
                  {uploadingPhotoNoteIdx === idx ? (
                    <div className="w-5 h-5 border-2 border-gray-300 border-t-active rounded-full animate-spin" />
                  ) : (
                    <>
                      <button type="button" onClick={() => document.getElementById(`photo-note-${idx}-cam-${lead.id}`)?.click()} title="ถ่ายรูป" className="hover:text-active transition-colors cursor-pointer">
                        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" /></svg>
                      </button>
                      <button type="button" onClick={() => document.getElementById(`photo-note-${idx}-lib-${lead.id}`)?.click()} title="แนบรูป" className="hover:text-active transition-colors cursor-pointer">
                        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
                      </button>
                    </>
                  )}
                </div>
              )}
              <textarea
                value={p.note}
                onChange={e => updatePhotoNote(idx, { note: e.target.value })}
                placeholder={`หมายเหตุรูปที่ ${idx + 1}`}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-primary resize-none"
              />
            </div>
          ))}
        </div>
      </div></>}
    </div>
  );
});

export default SurveyForm;
