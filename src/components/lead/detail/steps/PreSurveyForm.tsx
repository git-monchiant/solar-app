"use client";
import { BoltIcon, CameraIcon, CheckIcon, DocumentIcon, UserIcon } from "@/components/ui/icons";

import { Fragment, forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { apiFetch, getUserIdHeader } from "@/lib/api";
import FallbackImage from "@/components/ui/FallbackImage";
import type { Lead, Package } from "./types";
import { formatTHB as formatPrice } from "@/lib/utils/formatters";

const RESIDENCE_TYPES = [
  { value: "detached", label: "บ้านเดี่ยว" },
  { value: "semi_detached", label: "บ้านแฝด" },
  { value: "townhome", label: "ทาวน์โฮม" },
  { value: "townhouse", label: "ทาวน์เฮาส์" },
  { value: "home_office", label: "โฮมออฟฟิศ" },
  { value: "shophouse", label: "อาคารพาณิชย์" },
  { value: "other", label: "อื่นๆ" },
];

const HOUSE_AGES = [
  { value: "lt5",   label: "ต่ำกว่า 5 ปี" },
  { value: "5_10", label: "5-10 ปี" },
  { value: "10_20", label: "10-20 ปี" },
  { value: "gt20",  label: "มากกว่า 20 ปี" },
];

// Roof type for PreSurvey — broader buckets than the Survey step's roof
// material picker. Survey uses metal_sheet:bolt vs metal_sheet:clip, but at
// pre-survey time the customer rarely knows that detail.
const ROOF_SHAPES = [
  { value: "old_tile",   label: "กระเบื้องลอนคู่" },
  { value: "cpac_tile",  label: "กระเบื้องคอนกรีต / ซีแพค" },
  { value: "metal_sheet", label: "เมทัลชีท" },
  { value: "flat_tile",  label: "กระเบื้องแผ่นเรียบ" },
  { value: "concrete",   label: "ดาดฟ้าคอนกรีต" },
  { value: "unknown",    label: "ไม่ทราบ" },
  { value: "other",      label: "อื่นๆ" },
];

const ELECTRICAL_PHASES = [
  { value: "1_phase", label: "1 เฟส" },
  { value: "3_phase", label: "3 เฟส" },
  { value: "unknown", label: "ไม่ทราบ" },
];

const METER_SIZES = [
  { value: "15_45",  label: "15(45) A" },
  { value: "30_100", label: "30(100) A" },
  { value: "other",   label: "อื่นๆ" },
  { value: "unknown", label: "ไม่ทราบ" },
];

// Questionnaire §3 — Lifestyle Assessment
const YES_NO = [
  { value: "yes", label: "ใช่" },
  { value: "no",  label: "ไม่ใช่" },
];

const DAYTIME_OCCUPANTS = [
  { value: "family",  label: "ทั้งครอบครัว" },
  { value: "elderly", label: "ผู้สูงอายุ" },
  { value: "kids",    label: "เด็กเล็ก" },
  { value: "pets",    label: "สัตว์เลี้ยง" },
];

const BUSINESS_TYPES = [
  { value: "online_live", label: "ขายของ Online / Live" },
  { value: "online_edu",  label: "เรียน Online" },
  { value: "retail",      label: "ค้าขาย" },
  { value: "other",       label: "อื่นๆ" },
];

const WORK_DAYS_PER_WEEK = [
  { value: "1_2",   label: "1-2 วัน/สัปดาห์" },
  { value: "3_5",   label: "3-5 วัน/สัปดาห์" },
  { value: "daily", label: "ทุกวัน" },
];

// AC tier sizes for the day/night split picker. ">24000" carries the
// out-of-band gt24000 key — kept as a string so JSON shape stays consistent.
const AC_TIERS = [
  { key: "9000",    label: "9,000 BTU" },
  { key: "12000",   label: "12,000 BTU" },
  { key: "18000",   label: "18,000 BTU" },
  { key: "24000",   label: "24,000 BTU" },
  { key: "gt24000", label: ">24,000 BTU" },
];

const EV_CHARGE_PERIODS = [
  { value: "day",   label: "กลางวัน" },
  { value: "night", label: "กลางคืน" },
];

// Questionnaire §4 — Future Home Assessment (5-year horizon).
const YES_NO_CONSIDERING = [
  { value: "yes", label: "มี" },
  { value: "no",  label: "ไม่มี" },
  { value: "considering", label: "กำลังพิจารณา" },
];

const YES_NO_BIN = [
  { value: "yes", label: "มี" },
  { value: "no",  label: "ไม่มี" },
];

const YES_NO_MAYBE = [
  { value: "yes",   label: "มี" },
  { value: "no",    label: "ไม่มี" },
  { value: "maybe", label: "ยังไม่แน่ใจ" },
];

// Questionnaire §5 — Energy Security
const OUTAGE_PRIORITIES = [
  { value: "ac",         label: "แอร์" },
  { value: "lights",     label: "ไฟส่องสว่าง" },
  { value: "internet",   label: "Internet" },
  { value: "cctv",       label: "กล้องวงจรปิด" },
  { value: "fridge",     label: "ตู้เย็น" },
  { value: "ev_charger", label: "EV Charger" },
  { value: "gate",       label: "ระบบประตูรั้ว" },
  { value: "ups",        label: "ระบบสำรองฉุกเฉิน" },
  { value: "other",      label: "อื่นๆ" },
];

const BILL_RISE_ACTIONS = [
  { value: "now",      label: "ลดค่าไฟทันที" },
  { value: "longterm", label: "ควบคุมค่าใช้จ่ายระยะยาว" },
  { value: "prepare",  label: "เตรียมบ้านประหยัดพลังงาน" },
];

// Questionnaire §6 — Home Health Check
const EVER_NEVER = [
  { value: "yes", label: "เคย" },
  { value: "no",  label: "ไม่เคย" },
];

// Questionnaire §7 — Beyond Question
const ABLE_OR_NOT = [
  { value: "yes", label: "ได้" },
  { value: "no",  label: "ไม่ได้" },
];

const EV_READY_OPTIONS = [
  { value: "ready",    label: "พร้อม" },
  { value: "not_yet",  label: "ยังไม่พร้อม" },
  { value: "unsure",   label: "ไม่แน่ใจ" },
];

const USAGE_TREND_OPTIONS = [
  { value: "more", label: "มากขึ้น" },
  { value: "same", label: "เท่าเดิม" },
  { value: "less", label: "น้อยลง" },
];

// Questionnaire §8 — Decision Making Factor (1..5 weighted).
// Keys mirror what the back-end stores in the decision_factors JSON.
const DECISION_FACTORS = [
  { key: "company_reliable",   label: "บริษัทที่น่าเชื่อถือ มีทีมดูแลตลอดอายุการใช้งานระบบโซลาร์ อีก 30 ปีข้างหน้า" },
  { key: "home_understanding", label: "เข้าใจโครงสร้างบ้าน หลังคา และระบบไฟฟ้าในบ้านของคุณ" },
  { key: "equipment_standard", label: "มาตรฐานอุปกรณ์ที่ดีที่สุด" },
  { key: "engineer_design",    label: "มีวิศวกรออกแบบระบบให้เหมาะกับการใช้งานจริงของคุณ" },
  { key: "financial_advisor",  label: "มีทีมที่ปรึกษาด้านการเงิน" },
  { key: "installment_loan",   label: "มีบริการผ่อนชำระหรือสินเชื่อ" },
  { key: "affordable_price",   label: "ราคาย่อมเยา" },
];

type DecisionFactors = Record<string, number> & { other?: { score?: number; text?: string } };
function parseDecisionFactors(s: string | null | undefined): DecisionFactors {
  if (!s) return {};
  try { return JSON.parse(s) as DecisionFactors; } catch { return {}; }
}
function stringifyDecisionFactors(d: DecisionFactors, otherText: string): string | null {
  const out: DecisionFactors = { ...d };
  if (otherText && otherText.trim()) {
    out.other = { ...(out.other || {}), text: otherText.trim() };
  } else if (out.other) {
    // Drop text but keep score if there's any
    delete out.other.text;
  }
  const hasAny = DECISION_FACTORS.some(f => typeof out[f.key] === "number") || (out.other && (out.other.score || out.other.text));
  return hasAny ? JSON.stringify(out) : null;
}

type AcSplit = { day: Record<string, number>; night: Record<string, number> };
function emptyAcSplit(): AcSplit {
  const d: Record<string, number> = {}, n: Record<string, number> = {};
  AC_TIERS.forEach(t => { d[t.key] = 0; n[t.key] = 0; });
  return { day: d, night: n };
}
function parseAcSplit(s: string | null | undefined): AcSplit {
  if (!s) return emptyAcSplit();
  try {
    const parsed = JSON.parse(s) as { day?: Record<string, number>; night?: Record<string, number> };
    const out = emptyAcSplit();
    if (parsed.day)   for (const k of Object.keys(parsed.day))   if (k in out.day)   out.day[k]   = parsed.day[k] || 0;
    if (parsed.night) for (const k of Object.keys(parsed.night)) if (k in out.night) out.night[k] = parsed.night[k] || 0;
    return out;
  } catch { return emptyAcSplit(); }
}
function stringifyAcSplit(s: AcSplit): string | null {
  const hasAny = AC_TIERS.some(t => (s.day[t.key] || 0) > 0 || (s.night[t.key] || 0) > 0);
  return hasAny ? JSON.stringify(s) : null;
}

const BATTERY_OPTIONS = [
  { value: "no", label: "ไม่ต้องการ" },
  { value: "yes", label: "ต้องการ" },
  { value: "maybe", label: "ยังไม่แน่ใจ" },
  { value: "upgrade", label: "+ Upgrade" },
];

const AC_BTU_SIZES = [9000, 12000, 18000, 24000];

// Time-range buckets from questionnaire §2. Older leads may still hold
// "day" / "night" / "both" values; INFO_LABELS.peakUsage maps both old and
// new so display stays intact, but the chip picker only offers the new set.
const PEAK_USAGE = [
  { value: "morning",   label: "06.00-12.00" },
  { value: "afternoon", label: "12.00-18.00" },
  { value: "evening",   label: "18.00-24.00" },
  { value: "all_day",   label: "ตลอดวัน" },
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
  `h-8 px-3 rounded-lg text-xxs font-semibold border transition-all cursor-pointer ${
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
  const [roofShape, setRoofShape] = useState<string>(lead.pre_roof_shape ?? "");
  // Section 1 questionnaire — house age + occupancy counts. Stored on
  // lead_data (migration 038). Keep number inputs as `number | ""` so the
  // controlled input handles "user typed and deleted" cleanly.
  const [houseAge, setHouseAge]                 = useState<string>(lead.house_age ?? "");
  const [occupantTotal, setOccupantTotal]       = useState<number | "">(lead.occupant_total ?? "");
  const [occupantElderly, setOccupantElderly]   = useState<number | "">(lead.occupant_elderly ?? "");
  const [occupantKids, setOccupantKids]         = useState<number | "">(lead.occupant_kids ?? "");
  const [occupantPets, setOccupantPets]         = useState<number | "">(lead.occupant_pets ?? "");
  // Questionnaire §2 — current energy profile additions (migration 039).
  const [monthlyBillMax, setMonthlyBillMax] = useState<number | "">(lead.monthly_bill_max ?? "");
  const [meterSize, setMeterSize]           = useState<string>(lead.meter_size ?? "");
  // Questionnaire §3 — lifestyle assessment (migration 040).
  const [homeAtDaytime, setHomeAtDaytime]         = useState<string>(lead.home_at_daytime ?? "");
  const [daytimeOccupants, setDaytimeOccupants]   = useState<string[]>(
    lead.daytime_occupants ? lead.daytime_occupants.split(",").filter(Boolean) : []
  );
  const [workAtHome, setWorkAtHome]               = useState<string>(lead.work_at_home ?? "");
  const [businessType, setBusinessType]           = useState<string>(lead.business_type ?? "");
  const [workDaysPerWeek, setWorkDaysPerWeek]     = useState<string>(lead.work_days_per_week ?? "");
  const [acSplit, setAcSplit]                     = useState<AcSplit>(parseAcSplit(lead.ac_split));
  const [evChargePeriod, setEvChargePeriod]       = useState<string>(lead.ev_charge_period ?? "");
  // Questionnaire §4 — future home assessment (migration 041).
  const [futureEv, setFutureEv]                   = useState<string>(lead.future_ev ?? "");
  const [futureEvCharger, setFutureEvCharger]     = useState<string>(lead.future_ev_charger ?? "");
  const [futureExtendHome, setFutureExtendHome]   = useState<string>(lead.future_extend_home ?? "");
  const [futureMoreMembers, setFutureMoreMembers] = useState<string>(lead.future_more_members ?? "");
  const [futureSmartHome, setFutureSmartHome]     = useState<string>(lead.future_smart_home ?? "");
  const [futureBattery, setFutureBattery]         = useState<string>(lead.future_battery ?? "");
  // Questionnaire §5 — energy security (migration 042).
  const [outagePriorities, setOutagePriorities] = useState<string[]>(
    lead.outage_priorities ? lead.outage_priorities.split(",").filter(Boolean) : []
  );
  const [outageOtherText, setOutageOtherText]   = useState<string>(() => {
    const csv = lead.outage_priorities || "";
    const m = csv.split(",").find(s => s.startsWith("other:"));
    return m ? m.slice(6) : "";
  });
  const [billRiseAction, setBillRiseAction]     = useState<string>(lead.bill_rise_action ?? "");
  const toggleOutagePriority = (v: string) => {
    setOutagePriorities(prev => {
      if (v === "other") {
        return prev.some(x => x === "other" || x.startsWith("other:")) ? prev.filter(x => x !== "other" && !x.startsWith("other:")) : [...prev, "other"];
      }
      return prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v];
    });
  };
  // §6 Home Health Check
  const [hadRoofLeak, setHadRoofLeak]                 = useState<string>(lead.had_roof_leak         ?? "");
  const [didRoofRepair, setDidRoofRepair]             = useState<string>(lead.did_roof_repair       ?? "");
  const [hadElectricalIssue, setHadElectricalIssue]   = useState<string>(lead.had_electrical_issue  ?? "");
  const [didPanelReplacement, setDidPanelReplacement] = useState<string>(lead.did_panel_replacement ?? "");
  // §7 Beyond Question
  const [selfGenerates, setSelfGenerates]             = useState<string>(lead.self_generates       ?? "");
  const [evReady, setEvReady]                         = useState<string>(lead.ev_ready             ?? "");
  const [blackoutResilient, setBlackoutResilient]     = useState<string>(lead.blackout_resilient   ?? "");
  const [futureUsageTrend, setFutureUsageTrend]       = useState<string>(lead.future_usage_trend   ?? "");
  // §8 Decision Making Factor — single JSON column (migration 043).
  const [decisionFactors, setDecisionFactors] = useState<DecisionFactors>(parseDecisionFactors(lead.decision_factors));
  const [decisionOtherText, setDecisionOtherText] = useState<string>(() => parseDecisionFactors(lead.decision_factors).other?.text || "");
  // §8b Decision Timeline — single string code (migration 049). "other:<text>"
  // pattern follows the same shape as residenceType/roofShape.
  const [decisionTimeline, setDecisionTimeline] = useState<string>(lead.decision_timeline ?? "");
  const setFactorScore = (key: string, score: number) => {
    setDecisionFactors(prev => {
      const cur = (prev as Record<string, number>)[key];
      if (cur === score) {
        const { [key]: _, ...rest } = prev as Record<string, unknown>;
        void _;
        return rest as DecisionFactors;
      }
      return { ...prev, [key]: score };
    });
  };
  const setOtherFactorScore = (score: number) => {
    setDecisionFactors(prev => {
      const cur = prev.other?.score;
      const nextOther: { score?: number; text?: string } = { ...(prev.other || {}) };
      if (cur === score) delete nextOther.score; else nextOther.score = score;
      return { ...prev, other: nextOther } as DecisionFactors;
    });
  };
  const toggleDaytimeOccupant = (v: string) => {
    setDaytimeOccupants(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  };
  const setAcCount = (period: "day" | "night", tier: string, count: number) => {
    setAcSplit(prev => ({ ...prev, [period]: { ...prev[period], [tier]: Math.max(0, count) } }));
  };
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
      house_age: houseAge || null,
      // รวม is derived — no user input, just sum of the 3 subcounts. 0 → null
      // so we don't pollute lead_data with explicit 0s.
      occupant_total: (
        (typeof occupantElderly === "number" ? occupantElderly : 0)
        + (typeof occupantKids    === "number" ? occupantKids    : 0)
        + (typeof occupantPets    === "number" ? occupantPets    : 0)
      ) || null,
      occupant_elderly: typeof occupantElderly === "number" ? occupantElderly : null,
      occupant_kids:    typeof occupantKids    === "number" ? occupantKids    : null,
      occupant_pets:    typeof occupantPets    === "number" ? occupantPets    : null,
      monthly_bill_max: typeof monthlyBillMax  === "number" ? monthlyBillMax  : null,
      meter_size: meterSize || null,
      home_at_daytime:    homeAtDaytime || null,
      daytime_occupants:  daytimeOccupants.length ? daytimeOccupants.join(",") : null,
      work_at_home:       workAtHome || null,
      business_type:      businessType || null,
      work_days_per_week: workDaysPerWeek || null,
      ac_split:           stringifyAcSplit(acSplit),
      ev_charge_period:   evChargePeriod || null,
      future_ev:           futureEv          || null,
      future_ev_charger:   futureEvCharger   || null,
      future_extend_home:  futureExtendHome  || null,
      future_more_members: futureMoreMembers || null,
      future_smart_home:   futureSmartHome   || null,
      future_battery:      futureBattery     || null,
      outage_priorities: outagePriorities.length
        ? outagePriorities.map(p => p === "other" && outageOtherText ? `other:${outageOtherText}` : p).join(",")
        : null,
      bill_rise_action:        billRiseAction        || null,
      had_roof_leak:           hadRoofLeak           || null,
      did_roof_repair:         didRoofRepair         || null,
      had_electrical_issue:    hadElectricalIssue    || null,
      did_panel_replacement:   didPanelReplacement   || null,
      self_generates:          selfGenerates         || null,
      ev_ready:                evReady               || null,
      blackout_resilient:      blackoutResilient     || null,
      future_usage_trend:      futureUsageTrend      || null,
      decision_factors:        stringifyDecisionFactors(decisionFactors, decisionOtherText),
      decision_timeline:       decisionTimeline || null,
      interested_package_ids: selectedPkgs.length ? selectedPkgs.join(",") : null,
      interested_package_id: selectedPkgs.length ? parseInt(selectedPkgs[0]) : null,
    } as Partial<Lead>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residenceType, monthlyBill, peakUsage, electricalPhase, wantsBattery, acUnits, pre_appliances, roofShape, houseAge, occupantTotal, occupantElderly, occupantKids, occupantPets, monthlyBillMax, meterSize, homeAtDaytime, daytimeOccupants, workAtHome, businessType, workDaysPerWeek, acSplit, evChargePeriod, futureEv, futureEvCharger, futureExtendHome, futureMoreMembers, futureSmartHome, futureBattery, outagePriorities, outageOtherText, billRiseAction, hadRoofLeak, didRoofRepair, hadElectricalIssue, didPanelReplacement, selfGenerates, evReady, blackoutResilient, futureUsageTrend, decisionFactors, decisionOtherText, decisionTimeline, selectedPkgs]);

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
      house_age: houseAge || null,
      // รวม is derived — no user input, just sum of the 3 subcounts. 0 → null
      // so we don't pollute lead_data with explicit 0s.
      occupant_total: (
        (typeof occupantElderly === "number" ? occupantElderly : 0)
        + (typeof occupantKids    === "number" ? occupantKids    : 0)
        + (typeof occupantPets    === "number" ? occupantPets    : 0)
      ) || null,
      occupant_elderly: typeof occupantElderly === "number" ? occupantElderly : null,
      occupant_kids:    typeof occupantKids    === "number" ? occupantKids    : null,
      occupant_pets:    typeof occupantPets    === "number" ? occupantPets    : null,
      monthly_bill_max: typeof monthlyBillMax  === "number" ? monthlyBillMax  : null,
      meter_size: meterSize || null,
      home_at_daytime:    homeAtDaytime || null,
      daytime_occupants:  daytimeOccupants.length ? daytimeOccupants.join(",") : null,
      work_at_home:       workAtHome || null,
      business_type:      businessType || null,
      work_days_per_week: workDaysPerWeek || null,
      ac_split:           stringifyAcSplit(acSplit),
      ev_charge_period:   evChargePeriod || null,
      future_ev:           futureEv          || null,
      future_ev_charger:   futureEvCharger   || null,
      future_extend_home:  futureExtendHome  || null,
      future_more_members: futureMoreMembers || null,
      future_smart_home:   futureSmartHome   || null,
      future_battery:      futureBattery     || null,
      outage_priorities: outagePriorities.length
        ? outagePriorities.map(p => p === "other" && outageOtherText ? `other:${outageOtherText}` : p).join(",")
        : null,
      bill_rise_action:        billRiseAction        || null,
      had_roof_leak:           hadRoofLeak           || null,
      did_roof_repair:         didRoofRepair         || null,
      had_electrical_issue:    hadElectricalIssue    || null,
      did_panel_replacement:   didPanelReplacement   || null,
      self_generates:          selfGenerates         || null,
      ev_ready:                evReady               || null,
      blackout_resilient:      blackoutResilient     || null,
      future_usage_trend:      futureUsageTrend      || null,
      decision_factors:        stringifyDecisionFactors(decisionFactors, decisionOtherText),
      decision_timeline:       decisionTimeline || null,
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
  }, [residenceType, monthlyBill, peakUsage, electricalPhase, wantsBattery, acUnits, pre_appliances, roofShape, houseAge, occupantTotal, occupantElderly, occupantKids, occupantPets, monthlyBillMax, meterSize, homeAtDaytime, daytimeOccupants, workAtHome, businessType, workDaysPerWeek, acSplit, evChargePeriod, futureEv, futureEvCharger, futureExtendHome, futureMoreMembers, futureSmartHome, futureBattery, outagePriorities, outageOtherText, billRiseAction, hadRoofLeak, didRoofRepair, hadElectricalIssue, didPanelReplacement, selfGenerates, evReady, blackoutResilient, futureUsageTrend, decisionFactors, decisionOtherText, decisionTimeline, selectedPkgs]);

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
  const sectionTitle = "text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2";
  const sectionIconWrap = "w-7 h-7 rounded-lg bg-active/10 text-active flex items-center justify-center shrink-0";
  const fieldLabel = "text-xs text-gray-500 block mb-1.5";

  return (
    <div className="space-y-2">
      {/* DECISION TIMELINE — single-select chip, lifted above Customer Profile
          so the survey's most-decisive answer is captured first. */}
      <div className={`${sectionCls} ${onlyPackages ? "hidden" : ""}`}>
        <div className={sectionTitle}>
          <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-500 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l2.6 7.6L22 10l-6 4.4 2.4 7.6L12 17.8 5.6 22 8 14.4 2 10l7.4-.4L12 2z" />
            </svg>
          </span>
          ระยะเวลาในการตัดสินใจ
        </div>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
          {([
            { value: "1-3m",  label: "ภายใน 1-3 เดือน" },
            { value: "6m",    label: "ภายใน 6 เดือน" },
            { value: "1y+",   label: "มากกว่า 1 ปี" },
            { value: "other", label: "อื่นๆ" },
          ] as const).map(opt => {
            const active = opt.value === "other"
              ? decisionTimeline.startsWith("other")
              : decisionTimeline === opt.value;
            return (
              <button key={opt.value} type="button"
                onClick={() => setDecisionTimeline(opt.value === "other" ? "other" : opt.value)}
                className={chipBtn(active)}>
                {opt.label}
              </button>
            );
          })}
          {/* "อื่นๆ" free-text: lives inside the same 7-col row so on desktop
              it sits to the right of the chips. Mobile wraps to a new row
              (col-span-2 = full width). */}
          {decisionTimeline.startsWith("other") && (
            <input type="text" placeholder="ระบุ..."
              value={decisionTimeline.startsWith("other:") ? decisionTimeline.slice(6) : ""}
              onChange={e => setDecisionTimeline(e.target.value ? `other:${e.target.value}` : "other")}
              className="col-span-2 md:col-span-3 w-full h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-active" />
          )}
        </div>
      </div>

      {/* CUSTOMER PROFILE — questionnaire §1 */}
      {!hideResidence && (
        <div className={`${sectionCls} ${onlyPackages ? "hidden" : ""}`}>
          <div className={sectionTitle}>
            <span className={sectionIconWrap}><UserIcon className="w-4 h-4" /></span>
            Customer Profile
          </div>
          <label className={fieldLabel}>ประเภทบ้านพักอาศัย <span className="text-red-500">*</span></label>
          {/* Uniform md:grid-cols-7 across every chip group so each chip ends
              up the same width across sections (1/7). "อื่นๆ ระบุ" input
              wraps to its own row below — user said they'll arrange later. */}
          <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
            {RESIDENCE_TYPES.map(r => (
              <button key={r.value} type="button" onClick={() => setResidenceType(r.value)} className={chipBtn(residenceType === r.value || (r.value === "other" && residenceType.startsWith("other")))}>
                {r.label}
              </button>
            ))}
          </div>
          {residenceType.startsWith("other") && (
            <input type="text" placeholder="ระบุประเภทบ้าน..." value={residenceType.startsWith("other:") ? residenceType.slice(6) : ""} onChange={e => setResidenceType(e.target.value ? `other:${e.target.value}` : "other")} className="w-full mt-2 h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-active" />
          )}

          {/* อายุบ้าน — questionnaire §1 */}
          <div className="mt-3">
            <label className={fieldLabel}>อายุบ้าน</label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {HOUSE_AGES.map(h => (
                <button key={h.value} type="button" onClick={() => setHouseAge(houseAge === h.value ? "" : h.value)} className={chipBtn(houseAge === h.value)}>
                  {h.label}
                </button>
              ))}
            </div>
          </div>

          {/* ประเภทหลังคา — questionnaire §1 (column already on lead_data, just adding UI) */}
          <div className="mt-3">
            <label className={fieldLabel}>ประเภทหลังคา</label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {ROOF_SHAPES.map(r => (
                <button key={r.value} type="button" onClick={() => setRoofShape(roofShape === r.value ? "" : r.value)} className={chipBtn(roofShape === r.value || (r.value === "other" && roofShape.startsWith("other")))}>
                  {r.label}
                </button>
              ))}
            </div>
            {roofShape.startsWith("other") && (
              <input type="text" placeholder="ระบุประเภทหลังคา..." value={roofShape.startsWith("other:") ? roofShape.slice(6) : ""} onChange={e => setRoofShape(e.target.value ? `other:${e.target.value}` : "other")} className="w-full mt-2 h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-active" />
            )}
          </div>

          {/* จำนวนผู้อยู่อาศัย — questionnaire §1.
              Side-by-side columns (label on top, stepper below). 3 sub-counts
              + auto-derived total all in the same 7-col grid as chip groups. */}
          <div className="mt-3">
            <label className={fieldLabel}>จำนวนผู้อยู่อาศัย</label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {[
                { state: occupantElderly, setter: setOccupantElderly, label: "ผู้สูงอายุ" },
                { state: occupantKids,    setter: setOccupantKids,    label: "เด็ก" },
                { state: occupantPets,    setter: setOccupantPets,    label: "สัตว์เลี้ยง" },
              ].map((f, i) => {
                const v = typeof f.state === "number" ? f.state : 0;
                return (
                  <div key={i} className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">{f.label}</span>
                    <div className="flex items-center justify-center gap-1 h-8 rounded-lg border border-gray-200 bg-white px-2">
                      <button type="button" onClick={() => f.setter(v - 1 <= 0 ? "" : v - 1)} disabled={v === 0} className="w-7 h-7 rounded-md text-gray-600 text-sm font-semibold flex items-center justify-center hover:text-active disabled:opacity-30 disabled:cursor-not-allowed">−</button>
                      <span className="flex-1 text-center text-sm font-mono tabular-nums text-gray-800">{v}</span>
                      <button type="button" onClick={() => f.setter(v + 1)} className="w-7 h-7 rounded-md text-gray-600 text-sm font-semibold flex items-center justify-center hover:text-active">+</button>
                    </div>
                  </div>
                );
              })}
              {/* รวม — auto-sum cell. No buttons, just the computed total
                  styled to match the stepper height/border so it lines up. */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-500 font-semibold">รวมผู้อยู่อาศัย</span>
                <div className="flex items-center justify-center h-8 rounded-lg border border-gray-200 bg-gray-50 px-2">
                  <span className="text-sm font-mono tabular-nums font-bold text-active">
                    {(typeof occupantElderly === "number" ? occupantElderly : 0)
                     + (typeof occupantKids    === "number" ? occupantKids    : 0)
                     + (typeof occupantPets    === "number" ? occupantPets    : 0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CURRENT ENERGY PROFILE — questionnaire §2 */}
      <div className={`${sectionCls} ${onlyPackages ? "hidden" : ""}`}>
        <div className={sectionTitle}>
          <span className={sectionIconWrap}><BoltIcon className="w-4 h-4" /></span>
          Energy Profile
        </div>
        <div className="space-y-3">
          {/* Number inputs constrained to ~1/7 width on desktop via the same
              grid as the chip groups. Camera button sits outside the cell so
              it doesn't squish the input. */}
          <div>
            <label className={fieldLabel}>ค่าไฟต่อเดือน <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              <div className="relative col-span-2 md:col-span-1">
                <input type="number" inputMode="numeric" value={monthlyBill ?? ""} onChange={e => setMonthlyBill(e.target.value ? parseInt(e.target.value) : undefined)} placeholder="เช่น 3,500" className="w-full h-8 pl-3 pr-12 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium">บาท</span>
              </div>
              {/* Read-only range chips — auto-ticks the bucket that contains
                  the typed value. Display only; the input itself is the
                  source of truth. */}
              {([
                { key: "lt2k",  label: "ต่ำกว่า 2,000 บาท",  test: (b: number) => b < 2000 },
                { key: "2k4k",  label: "2,000-4,000 บาท",   test: (b: number) => b >= 2000 && b < 4000 },
                { key: "4k6k",  label: "4,000-6,000 บาท",   test: (b: number) => b >= 4000 && b < 6000 },
                { key: "6k10k", label: "6,000-10,000 บาท",  test: (b: number) => b >= 6000 && b <= 10000 },
                { key: "gt10k", label: "มากกว่า 10,000 บาท", test: (b: number) => b > 10000 },
              ] as const).map(r => {
                const active = typeof monthlyBill === "number" && r.test(monthlyBill);
                return (
                  <div key={r.key}
                    className={`col-span-1 md:col-span-1 h-8 px-2 rounded-lg border flex items-center gap-1.5 text-xs select-none ${
                      active ? "border-active bg-active-light text-active" : "border-gray-200 bg-gray-50 text-gray-400"
                    }`}>
                    <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${
                      active ? "border-active bg-active text-white" : "border-gray-300 bg-white"
                    }`}>
                      {active && (
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{r.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* ค่าไฟสูงสุดที่เคยจ่าย — questionnaire §2 */}
          <div>
            <label className={fieldLabel}>ค่าไฟสูงสุดที่เคยจ่าย</label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              <div className="relative col-span-1">
                <input type="number" inputMode="numeric" value={monthlyBillMax === "" ? "" : monthlyBillMax} onChange={e => setMonthlyBillMax(e.target.value ? Math.max(0, parseInt(e.target.value)) : "")} placeholder="เช่น 8,500" className="w-full h-8 pl-3 pr-12 rounded-lg border border-gray-200 text-sm font-mono tabular-nums focus:outline-none focus:border-primary" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-medium">บาท</span>
              </div>
            </div>
          </div>
          <div>
            <label className={fieldLabel}>ระบบไฟปัจจุบัน <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {ELECTRICAL_PHASES.map(p => (
                <button key={p.value} type="button" onClick={() => { setElectricalPhase(p.value); setSelectedPkgs([]); }} className={chipBtn(electricalPhase === p.value)}>{p.label}</button>
              ))}
            </div>
          </div>
          {/* ขนาดมิเตอร์ — questionnaire §2 */}
          <div>
            <label className={fieldLabel}>ขนาดมิเตอร์</label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {METER_SIZES.map(m => (
                <button key={m.value} type="button" onClick={() => setMeterSize(meterSize === m.value ? "" : m.value)} className={chipBtn(meterSize === m.value || (m.value === "other" && meterSize.startsWith("other")))}>{m.label}</button>
              ))}
            </div>
            {meterSize.startsWith("other") && (
              <input type="text" placeholder="ระบุขนาดมิเตอร์..." value={meterSize.startsWith("other:") ? meterSize.slice(6) : ""} onChange={e => setMeterSize(e.target.value ? `other:${e.target.value}` : "other")} className="w-full mt-2 h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-active" />
            )}
          </div>
          <div>
            <label className={fieldLabel}>ช่วงเวลาที่ใช้ไฟสูงสุด <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {PEAK_USAGE.map(p => (
                <button key={p.value} type="button" onClick={() => setPeakUsage(p.value)} className={chipBtn(peakUsage === p.value)}>{p.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>


      {/* LIFESTYLE ASSESSMENT — questionnaire §3 */}
      <div className={`${sectionCls} ${onlyPackages ? "hidden" : ""}`}>
        <div className={sectionTitle}>
          <span className={sectionIconWrap}><DocumentIcon className="w-4 h-4" /></span>
          Lifestyle Assessment
        </div>
        <div className="space-y-3">
          {/* อยู่บ้านช่วงกลางวัน + ผู้ที่อยู่ (cascading) */}
          <div>
            <label className={fieldLabel}>อยู่บ้านช่วงกลางวันหรือไม่</label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {YES_NO.map(o => (
                <button key={o.value} type="button" onClick={() => setHomeAtDaytime(homeAtDaytime === o.value ? "" : o.value)} className={chipBtn(homeAtDaytime === o.value)}>{o.label}</button>
              ))}
            </div>
          </div>
          {homeAtDaytime === "yes" && (
            <div>
              <label className={fieldLabel}>ผู้ที่อยู่บ้านช่วงกลางวัน (เลือกได้มากกว่า 1)</label>
              <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                {DAYTIME_OCCUPANTS.map(o => (
                  <button key={o.value} type="button" onClick={() => toggleDaytimeOccupant(o.value)} className={chipBtn(daytimeOccupants.includes(o.value))}>{o.label}</button>
                ))}
              </div>
            </div>
          )}

          {/* ทำงานที่บ้าน + ประเภทธุรกิจ + วันทำงาน (cascading) */}
          <div>
            <label className={fieldLabel}>ทำงาน/เปิดธุรกิจที่บ้านหรือไม่</label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {YES_NO.map(o => (
                <button key={o.value} type="button" onClick={() => setWorkAtHome(workAtHome === o.value ? "" : o.value)} className={chipBtn(workAtHome === o.value)}>{o.label}</button>
              ))}
            </div>
          </div>
          {workAtHome === "yes" && (
            <>
              <div>
                <label className={fieldLabel}>ประเภทธุรกิจ / ทำงานที่บ้าน</label>
                <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                  {BUSINESS_TYPES.map(b => (
                    <button key={b.value} type="button" onClick={() => setBusinessType(businessType === b.value ? "" : b.value)} className={chipBtn(businessType === b.value || (b.value === "other" && businessType.startsWith("other")))}>{b.label}</button>
                  ))}
                </div>
                {businessType.startsWith("other") && (
                  <input type="text" placeholder="ระบุประเภทธุรกิจ..." value={businessType.startsWith("other:") ? businessType.slice(6) : ""} onChange={e => setBusinessType(e.target.value ? `other:${e.target.value}` : "other")} className="w-full mt-2 h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-active" />
                )}
              </div>
              <div>
                <label className={fieldLabel}>จำนวนวันทำงานที่บ้าน</label>
                <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                  {WORK_DAYS_PER_WEEK.map(d => (
                    <button key={d.value} type="button" onClick={() => setWorkDaysPerWeek(workDaysPerWeek === d.value ? "" : d.value)} className={chipBtn(workDaysPerWeek === d.value)}>{d.label}</button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* เครื่องปรับอากาศ — 2 ชุด แยกหัวข้อ (กลางวัน, กลางคืน). Each card
              spans 2 cols of the form's md:grid-cols-7 grid so they line up
              with the chip rows above (chip = 1/7, AC card = 2/7). 5 BTU tiers
              stacked vertically inside each card. */}
          <div>
            <label className={fieldLabel}>การใช้งานเครื่องปรับอากาศ (จำนวนเครื่อง)</label>
            <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
              {(["day", "night"] as const).map(period => (
                <div key={period} className="md:col-span-2 rounded-lg border border-gray-200 bg-white/50 p-3">
                  <div className={fieldLabel}>
                    เครื่องปรับอากาศ — ช่วง{period === "day" ? "กลางวัน" : "กลางคืน"}
                  </div>
                  <div className="space-y-2">
                    {AC_TIERS.map(t => {
                      const v = acSplit[period][t.key] || 0;
                      return (
                        <div key={t.key} className="flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-700">{t.label}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button type="button" onClick={() => setAcCount(period, t.key, v - 1)} disabled={v === 0} className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 text-sm font-semibold flex items-center justify-center hover:border-active/40 hover:text-active disabled:opacity-30 disabled:cursor-not-allowed transition-colors">−</button>
                            <span className="w-7 text-center text-sm font-mono tabular-nums text-gray-800">{v}</span>
                            <button type="button" onClick={() => setAcCount(period, t.key, v + 1)} className="w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-600 text-sm font-semibold flex items-center justify-center hover:border-active/40 hover:text-active transition-colors">+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* EV charger + period (cascading) */}
          <div>
            <label className={fieldLabel}>ที่ชาร์จรถ EV</label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              <button type="button" onClick={() => { if (!pre_appliances.includes("ev")) toggleAppliance("ev"); }} className={chipBtn(pre_appliances.includes("ev"))}>มี</button>
              <button type="button" onClick={() => { if (pre_appliances.includes("ev")) toggleAppliance("ev"); }} className={chipBtn(!pre_appliances.includes("ev"))}>ไม่มี</button>
            </div>
          </div>
          {pre_appliances.includes("ev") && (
            <div>
              <label className={fieldLabel}>ชาร์จ EV ช่วงไหน</label>
              <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                {EV_CHARGE_PERIODS.map(p => (
                  <button key={p.value} type="button" onClick={() => setEvChargePeriod(evChargePeriod === p.value ? "" : p.value)} className={chipBtn(evChargePeriod === p.value)}>{p.label}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* FUTURE HOME ASSESSMENT — questionnaire §4 (5-year plans) */}
      <div className={`${sectionCls} ${onlyPackages ? "hidden" : ""}`}>
        <div className={sectionTitle}>
          <span className={sectionIconWrap}><DocumentIcon className="w-4 h-4" /></span>
          Future Home Assessment
        </div>
        <p className="text-xs text-gray-500 -mt-1 mb-3">ภายใน 5 ปีข้างหน้าท่านวางแผนอย่างไรบ้าง</p>
        <div className="space-y-3">
          {[
            { state: futureEv,          setter: setFutureEv,          label: "แผนซื้อรถยนต์ EV",            choices: YES_NO_CONSIDERING },
            { state: futureEvCharger,   setter: setFutureEvCharger,   label: "แผนติดตั้ง EV Charger",       choices: YES_NO_BIN },
            { state: futureExtendHome,  setter: setFutureExtendHome,  label: "แผนต่อเติมบ้าน",              choices: YES_NO_BIN },
            { state: futureMoreMembers, setter: setFutureMoreMembers, label: "แผนเพิ่มจำนวนสมาชิกในบ้าน",   choices: YES_NO_BIN },
            { state: futureSmartHome,   setter: setFutureSmartHome,   label: "แผนติดตั้งระบบ Smart Home",   choices: YES_NO_BIN },
            { state: futureBattery,     setter: setFutureBattery,     label: "แผนติด Battery เก็บไฟจาก Solar", choices: YES_NO_MAYBE },
          ].map((row, i) => (
            <div key={i}>
              <label className={fieldLabel}>{row.label}</label>
              <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                {row.choices.map(o => (
                  <button key={o.value} type="button" onClick={() => row.setter(row.state === o.value ? "" : o.value)} className={chipBtn(row.state === o.value)}>{o.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ENERGY SECURITY ASSESSMENT — questionnaire §5 */}
      <div className={`${sectionCls} ${onlyPackages ? "hidden" : ""}`}>
        <div className={sectionTitle}>
          <span className={sectionIconWrap}><BoltIcon className="w-4 h-4" /></span>
          Energy Security Assessment
        </div>
        <div className="space-y-3">
          <div>
            <label className={fieldLabel}>หากไฟดับ 6 ชั่วโมง สิ่งที่สำคัญที่สุดสำหรับคุณ (เลือกได้มากกว่า 1)</label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {OUTAGE_PRIORITIES.map(o => {
                const isOther = o.value === "other";
                const active = isOther
                  ? outagePriorities.some(x => x === "other" || x.startsWith("other:"))
                  : outagePriorities.includes(o.value);
                return (
                  <button key={o.value} type="button" onClick={() => toggleOutagePriority(o.value)} className={chipBtn(active)}>{o.label}</button>
                );
              })}
            </div>
            {outagePriorities.some(x => x === "other" || x.startsWith("other:")) && (
              <input type="text" placeholder="ระบุ..." value={outageOtherText} onChange={e => setOutageOtherText(e.target.value)} className="w-full mt-2 h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-active" />
            )}
          </div>
          <div>
            <label className={fieldLabel}>หากค่าไฟเพิ่มขึ้นอีก 30% คุณต้องการ</label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {BILL_RISE_ACTIONS.map(b => (
                <button key={b.value} type="button" onClick={() => setBillRiseAction(billRiseAction === b.value ? "" : b.value)} className={chipBtn(billRiseAction === b.value)}>{b.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* HOME HEALTH CHECK — questionnaire §6 */}
      <div className={`${sectionCls} ${onlyPackages ? "hidden" : ""}`}>
        <div className={sectionTitle}>
          <span className={sectionIconWrap}><CheckIcon className="w-4 h-4" /></span>
          Home Health Check
        </div>
        <div className="space-y-3">
          {[
            { state: hadRoofLeak,         setter: setHadRoofLeak,         label: "เคยมีปัญหาหลังคารั่ว" },
            { state: didRoofRepair,       setter: setDidRoofRepair,       label: "เคยปรับปรุง / ซ่อมแซมหลังคา" },
            { state: hadElectricalIssue,  setter: setHadElectricalIssue,  label: "เคยมีปัญหาระบบไฟฟ้า" },
            { state: didPanelReplacement, setter: setDidPanelReplacement, label: "เคยเปลี่ยนตู้ควบคุมไฟฟ้าในบ้าน" },
          ].map((row, i) => (
            <div key={i}>
              <label className={fieldLabel}>{row.label}</label>
              <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                {EVER_NEVER.map(o => (
                  <button key={o.value} type="button" onClick={() => row.setter(row.state === o.value ? "" : o.value)} className={chipBtn(row.state === o.value)}>{o.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* BEYOND QUESTION — questionnaire §7 */}
      <div className={`${sectionCls} ${onlyPackages ? "hidden" : ""}`}>
        <div className={sectionTitle}>
          <span className={sectionIconWrap}><DocumentIcon className="w-4 h-4" /></span>
          Beyond Question
        </div>
        <div className="space-y-3">
          <div>
            <label className={fieldLabel}>บ้านของคุณผลิตพลังงานไฟฟ้าเองได้ไหมในวันนี้</label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {ABLE_OR_NOT.map(o => (
                <button key={o.value} type="button" onClick={() => setSelfGenerates(selfGenerates === o.value ? "" : o.value)} className={chipBtn(selfGenerates === o.value)}>{o.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={fieldLabel}>วันนี้บ้านของคุณพร้อมสำหรับรถยนต์ EV แล้วหรือยัง</label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {EV_READY_OPTIONS.map(o => (
                <button key={o.value} type="button" onClick={() => setEvReady(evReady === o.value ? "" : o.value)} className={chipBtn(evReady === o.value)}>{o.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={fieldLabel}>ถ้าไฟดับคืนนี้ บ้านคุณยังใช้ชีวิตได้ตามปกติหรือไม่</label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {ABLE_OR_NOT.map(o => (
                <button key={o.value} type="button" onClick={() => setBlackoutResilient(blackoutResilient === o.value ? "" : o.value)} className={chipBtn(blackoutResilient === o.value)}>{o.label}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={fieldLabel}>บ้านของคุณในอีก 10 ปีข้างหน้าจะใช้ไฟมากขึ้นหรือน้อยลง</label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {USAGE_TREND_OPTIONS.map(o => (
                <button key={o.value} type="button" onClick={() => setFutureUsageTrend(futureUsageTrend === o.value ? "" : o.value)} className={chipBtn(futureUsageTrend === o.value)}>{o.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* DECISION MAKING FACTOR — questionnaire §8 (rate each 1..5) */}
      <div className={`${sectionCls} ${onlyPackages ? "hidden" : ""}`}>
        <div className={sectionTitle}>
          <span className={sectionIconWrap}><CheckIcon className="w-4 h-4" /></span>
          Decision Making Factor
        </div>
        <p className="text-xs text-gray-500 -mt-1 mb-3">
          ปัจจัยในการตัดสินใจเลือกผู้ดูแลในการติดตั้งระบบโซลาร์ของคุณ (ระบุความสำคัญ น้อย → มาก)
        </p>

        <div className="space-y-3">
          {DECISION_FACTORS.map((f, i) => {
            const score = (decisionFactors as Record<string, number>)[f.key];
            return (
              <div key={f.key} className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-center">
                <label className="text-xs text-gray-700">
                  <span className="font-mono tabular-nums text-gray-400 mr-1.5">{i + 1}.</span>
                  {f.label}
                </label>
                <div className="flex items-center gap-1.5 shrink-0">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setFactorScore(f.key, n)}
                      className={`w-8 h-8 rounded-lg border text-sm font-semibold transition-all ${score === n ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200 hover:border-active/40"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {/* อื่นๆ ระบุ — free text + 1..5 rating */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-center pt-2 border-t border-gray-100">
            <div className="flex items-center gap-1.5">
              <span className="font-mono tabular-nums text-gray-400 text-xs">{DECISION_FACTORS.length + 1}.</span>
              <input type="text" placeholder="อื่นๆ ระบุ..." value={decisionOtherText} onChange={e => setDecisionOtherText(e.target.value)} className="flex-1 h-8 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-active" />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" onClick={() => setOtherFactorScore(n)}
                  className={`w-8 h-8 rounded-lg border text-sm font-semibold transition-all ${decisionFactors.other?.score === n ? "bg-active text-white border-active" : "bg-white text-gray-600 border-gray-200 hover:border-active/40"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* แบตเตอรี่ + แพ็คเกจ */}
      {packages.length > 0 && (
        <div className={`${sectionCls} ${hidePackages ? "hidden" : ""}`}>
          <div className="mb-3">
            <label className={fieldLabel}>ต้องการแบตเตอรี่ + Upgrade <span className="text-red-500">*</span></label>
            <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
              {BATTERY_OPTIONS.map(b => (
                <button key={b.value} type="button" onClick={() => { setWantsBattery(b.value); setSelectedPkgs([]); }} className={chipBtn(wantsBattery === b.value)}>{b.label}</button>
              ))}
            </div>
          </div>
          <div className={sectionTitle}>
            <span className={sectionIconWrap}><BoltIcon className="w-4 h-4" /></span>
            แพ็คเกจ
            {wantsBattery === "yes" && <span className="ml-2 text-xs font-medium text-gray-400 normal-case">· มีแบตเตอรี่</span>}
            {wantsBattery === "no" && <span className="ml-2 text-xs font-medium text-gray-400 normal-case">· ไม่มีแบตเตอรี่</span>}
          </div>
          {/* 7-col grid to match chip groups elsewhere; each package card is
              2 cols wide → up to 3 packages per row on desktop. */}
          <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
            {filteredPackages.length === 0 && (
              <div className="col-span-full text-center py-6 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">ไม่มีแพ็คเกจที่ตรงกับที่เลือก</div>
            )}
            {filteredPackages.map(p => {
              const selected = selectedPkgs.includes(String(p.id));
              return (
                <button key={p.id} type="button" onClick={() => togglePkg(String(p.id))} className={`md:col-span-2 text-left rounded-xl p-3 border-2 transition-all ${selected ? "border-active bg-active-light" : "border-gray-100 bg-white"}`}>
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
