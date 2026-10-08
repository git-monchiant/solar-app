// Load Assumption — the one place that knows how Customer Info's appliance
// answers become kWh per day. The questionnaire form's live total, the site
// survey report (§3), the quotation submit gate and Dashboard III all read it,
// so the numbers can never disagree between surfaces.
//
// Self-contained on purpose (no imports): scripts/tests runs this file under
// `node --experimental-strip-types`, which cannot resolve "@/..." or
// extension-less imports. AC tier keys match AC_TIERS in customer-questionnaire.
//
// The customer is never asked for wattage — only how many and for how long.
// Power comes from the defaults below, each with its source (researched
// 28 Sep 2026, plan 20260928-01 decision D1). Change them here only.
//
// Stored as JSON in lead_data.load_profile. Per device:
//   key missing        → not asked yet   → report leaves the row blank
//   { qty: 0 }         → has none        → a real answer, 0 kWh
//   { unknown: true }  → customer can't say → counts as answered, prints blank

export type LoadPeriod = "day" | "night";
export type LoadDeviceKey = "ac" | "fridge" | "water_heater" | "water_pump" | "washer" | "electronics" | "lighting" | "ev";

export type LoadEntry = {
  unknown?: boolean;
  qty?: number;
  day_h?: number;
  night_h?: number;
  day_min?: number;
  night_min?: number;
  loads_per_week?: number;
  period?: LoadPeriod;
  charger_kw?: number;
  sessions_per_week?: number;
  hours_per_session?: number;
};
export type LoadProfile = Partial<Record<LoadDeviceKey, LoadEntry>>;

export const LOAD_PROFILE_VERSION = 1;

// AC: BTU ÷ the minimum SEER that still earns EGAT's Label No.5 —
// ≥ 12.85 up to 27,296 BTU, ≥ 12.40 for 27,297–40,944 BTU
// (https://homeno5.egat.co.th/info/air5/). SEER is seasonal, so this is closer
// to real consumption than the nameplate (≈ BTU ÷ 11, which we used first and
// overstated AC — the biggest load in most homes). A more efficient unit uses
// less, so the estimate errs high, which is the safe side for system sizing.
// The ">24,000" tier is costed as a 30,000 BTU unit.
const AC_TIER_BTU: Record<string, number> = {
  "9000": 9000, "12000": 12000, "18000": 18000, "24000": 24000, gt24000: 30000,
};
const labelNo5MinSeer = (btu: number) => (btu <= 27296 ? 12.85 : 12.40);
export const AC_TIER_KW: Record<string, number> = Object.fromEntries(
  Object.entries(AC_TIER_BTU).map(([tier, btu]) => [tier, Math.round(btu / labelNo5MinSeer(btu)) / 1000]),
);
const AC_TIER_LABEL: Record<string, string> = {
  "9000": "9,000", "12000": "12,000", "18000": "18,000", "24000": "24,000", gt24000: ">24,000",
};

// Ranges below: CapSolar's Thai appliance table (nameplate / Label No.5
// spec ranges) unless noted — https://capsolar.co.th/en/knowledge/appliance-electricity-cost-thailand
export const LOAD_DEFAULT_KW = {
  // 50 W averaged over 24 h ≈ 1.2 kWh/day. EGAT's Label No.5 ceiling for a
  // fridge-freezer < 450 L is 0.52·AV + 319 kWh/yr → 1.16–1.30 kWh/day for a
  // typical 2-door (AV 200–300 L); 3-star ≈ 0.85–0.95. Older fridges run
  // higher — MEA's infographic puts a 7.9 cu ft in hot weather at ≈ 2.5.
  fridge: 0.05,
  water_heater: 3.5,  // range 3,500–6,000 W — the low end
  water_pump: 0.3,    // range 250–450 W
  washer: 0.5,        // one load ≈ 1 h ≈ 0.5 kWh; range 500–2,100 W, the top is models with a heater
  electronics: 0.1,   // LED TV 43–55" 60–150 W
  lighting: 0.01,     // LED ≈ 5–12 W per bulb
} as const;
export const WASHER_HOURS_PER_LOAD = 1;
// EV: a home wallbox draws up to 32 A (≈ 7.4 kW single-phase) and EGAT says it
// needs a 1-phase 30(100)A or 3-phase meter — 15(45)A is not enough
// (https://www.egat.co.th/home/save-energy-for-all-20230102/). So the default
// follows the meter the survey recorded: 3.6 kW (16 A) on a 1-phase 15(45)A,
// 7.4 kW otherwise — including unknown, since a home that already has a
// charger has usually been upgraded. The 3.6 kW-on-15(45)A pairing is from
// installer guides, not EGAT.
export const EV_CHARGER_KW_OPTIONS = [3.6, 7.4] as const;
export const EV_CHARGER_KW_DEFAULT = 7.4;
export function defaultEvChargerKw(meterSize: unknown, electricalPhase: unknown): number {
  if (electricalPhase === "3_phase") return EV_CHARGER_KW_DEFAULT;
  return meterSize === "15_45" ? 3.6 : EV_CHARGER_KW_DEFAULT;
}
// Same ฿/kWh the report's loan calculator assumes; used only when the
// quotation doesn't carry its own electricity_rate.
export const DEFAULT_ELECTRICITY_RATE = 5;

export const LOAD_DEVICES: { key: LoadDeviceKey; label: string }[] = [
  { key: "ac", label: "เครื่องปรับอากาศ" },
  { key: "fridge", label: "ตู้เย็น" },
  { key: "water_heater", label: "เครื่องทำน้ำอุ่น" },
  { key: "water_pump", label: "ปั๊มน้ำ" },
  { key: "washer", label: "เครื่องซักผ้า" },
  { key: "electronics", label: "ทีวี / เครื่องใช้ไฟฟ้าอิเล็กทรอนิกส์" },
  { key: "lighting", label: "หลอดไฟส่องสว่าง" },
  { key: "ev", label: "ที่ชาร์จรถ EV" },
];

// Upper bounds keep a fat-fingered stepper (or a hand-edited PATCH) from
// printing a 9,000 kWh day on a customer document.
const LIMITS: Record<keyof Omit<LoadEntry, "unknown" | "period">, number> = {
  qty: 200, day_h: 12, night_h: 12, day_min: 720, night_min: 720,
  loads_per_week: 28, charger_kw: 22, sessions_per_week: 14, hours_per_session: 24,
};

function num(v: unknown, max: number): number | undefined {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return undefined;
  return Math.min(n, max);
}

function cleanEntry(raw: unknown): LoadEntry | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (r.unknown === true) return { unknown: true };
  const out: LoadEntry = {};
  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const v = num(r[key], LIMITS[key]);
    if (v !== undefined) out[key] = v;
  }
  if (r.period === "day" || r.period === "night") out.period = r.period;
  return Object.keys(out).length ? out : undefined;
}

export function parseLoadProfile(raw: unknown): LoadProfile {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return {};
    try { obj = JSON.parse(raw); } catch { return {}; }
  }
  if (!obj || typeof obj !== "object") return {};
  const out: LoadProfile = {};
  for (const { key } of LOAD_DEVICES) {
    const entry = cleanEntry((obj as Record<string, unknown>)[key]);
    if (entry) out[key] = entry;
  }
  return out;
}

export function serializeLoadProfile(profile: LoadProfile): string | null {
  const clean = parseLoadProfile(profile);
  return Object.keys(clean).length ? JSON.stringify({ v: LOAD_PROFILE_VERSION, ...clean }) : null;
}

export function hasEvCharger(appliances: unknown): boolean {
  return String(appliances ?? "").split(",").map(s => s.trim()).includes("ev");
}

// appliances is a CSV that may hold other (legacy) codes — flip only 'ev'
// and keep the rest. Empty → null, which is how the form stores "ไม่มี".
export function setEvCharger(appliances: unknown, has: boolean): string | null {
  const rest = String(appliances ?? "").split(",").map(s => s.trim()).filter(s => s && s !== "ev");
  const next = has ? [...rest, "ev"] : rest;
  return next.length ? next.join(",") : null;
}

type AcSplit = { day: Record<string, number>; night: Record<string, number> };
function parseAcSplit(raw: unknown): AcSplit | null {
  if (!raw) return null;
  try {
    const o = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<AcSplit>;
    const pick = (seg?: Record<string, unknown>) => Object.fromEntries(
      Object.entries(seg || {}).filter(([k]) => k in AC_TIER_KW).map(([k, n]) => [k, Math.max(0, Number(n) || 0)]),
    );
    return { day: pick(o?.day), night: pick(o?.night) };
  } catch { return null; }
}

export type LoadRowStatus = "blank" | "unknown" | "partial" | "answered";
export type LoadRow = {
  key: string;
  label: string;
  status: LoadRowStatus;
  qty: string | null;        // display text for the จำนวน column
  size: string | null;       // display text for the ขนาด / กำลังไฟ column
  dayApplies: boolean;       // false → the cell is "—", not a blank to fill
  nightApplies: boolean;
  dayHours: number | null;
  nightHours: number | null;
  dayKwh: number | null;
  nightKwh: number | null;
};
export type LoadResult = {
  rows: LoadRow[];
  dayKwh: number | null;     // null when no row could be computed
  nightKwh: number | null;
  nightShare: number | null; // 0..1
  computedRows: number;      // rows that produced kWh
  totalRows: number;
  asked: boolean;            // the load questions were touched at all
};

export type LoadInput = {
  load_profile?: unknown;
  ac_split?: unknown;
  appliances?: unknown;
  ev_charge_period?: unknown;
  // Only used for the EV charger's default kW. Callers that have the survey
  // pass the surveyor's measured values; lead_data's own answers otherwise.
  meter_size?: unknown;
  electrical_phase?: unknown;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
// Power and hours are shown to 2 decimals and every kWh is computed FROM the
// shown figures, so a reader who multiplies จำนวน × กำลังไฟ × ชม. off the
// printed row lands on the printed kWh. (Computing from exact values and
// showing 1 decimal made rows disagree by 0.1–0.3 — e.g. ≈2.3 kW × 9 h
// printed as 21 because the real figure was 2.334 kW.)
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const kwText = (kw: number) => kw < 1 ? `${fmt(kw * 1000)} W` : `${fmt(kw)} kW`;

function row(key: string, label: string, over: Partial<LoadRow>): LoadRow {
  return {
    key, label, status: "blank", qty: null, size: null, dayApplies: true, nightApplies: true,
    dayHours: null, nightHours: null, dayKwh: null, nightKwh: null, ...over,
  };
}

// qty × kW × hours for one device whose answer is qty + hours per period.
function hoursRow(key: string, label: string, e: LoadEntry | undefined, kw: number, hourKeys: ["day_h", "night_h"] | ["day_min", "night_min"]): LoadRow {
  if (!e) return row(key, label, { size: kwText(kw) });
  if (e.unknown) return row(key, label, { status: "unknown", size: kwText(kw) });
  const div = hourKeys[0] === "day_min" ? 60 : 1;
  const dayH = e[hourKeys[0]] !== undefined ? r2((e[hourKeys[0]] as number) / div) : null;
  const nightH = e[hourKeys[1]] !== undefined ? r2((e[hourKeys[1]] as number) / div) : null;
  const qty = e.qty ?? null;
  if (qty === 0) return row(key, label, { status: "answered", qty: "0", size: kwText(kw), dayHours: 0, nightHours: 0, dayKwh: 0, nightKwh: 0 });
  const complete = qty !== null && dayH !== null && nightH !== null;
  return row(key, label, {
    status: complete ? "answered" : "partial",
    qty: qty !== null ? fmt(qty) : null,
    size: kwText(kw),
    dayHours: dayH, nightHours: nightH,
    dayKwh: complete ? r1(qty * kw * dayH) : null,
    nightKwh: complete ? r1(qty * kw * nightH) : null,
  });
}

function acRows(profile: LoadProfile, acRaw: unknown): LoadRow[] {
  const split = parseAcSplit(acRaw);
  const e = profile.ac;
  return (["day", "night"] as const).map(period => {
    const key = `ac_${period}`;
    const label = `เครื่องปรับอากาศ (ใช้${period === "day" ? "กลางวัน" : "กลางคืน"})`;
    const applies = { dayApplies: period === "day", nightApplies: period === "night" };
    const seg = split?.[period] || {};
    const tiers = Object.entries(seg).filter(([, n]) => n > 0);
    const units = tiers.reduce((a, [, n]) => a + n, 0);
    const kw = r2(tiers.reduce((a, [k, n]) => a + n * AC_TIER_KW[k], 0));
    const size = tiers.length
      ? `${tiers.map(([k, n]) => `${AC_TIER_LABEL[k]} BTU × ${n}`).join(", ")} · ≈${fmt(kw)} kW`
      : null;
    // ac_split is only stored when some period has a machine, so a split with
    // nothing in THIS period is a known zero. No split and no hours answer →
    // nothing is known yet.
    if (!units && !e && !split) return row(key, label, applies);
    if (!units) return row(key, label, { ...applies, status: "answered", qty: "0", dayHours: 0, nightHours: 0, dayKwh: 0, nightKwh: 0 });
    const hours = e && !e.unknown ? (period === "day" ? e.day_h : e.night_h) : undefined;
    const base = { ...applies, qty: String(units), size };
    if (e?.unknown) return row(key, label, { ...base, status: "unknown" });
    if (hours === undefined) return row(key, label, { ...base, status: "partial" });
    const kwh = r1(kw * hours);
    return period === "day"
      ? row(key, label, { ...base, status: "answered", dayHours: hours, dayKwh: kwh })
      : row(key, label, { ...base, status: "answered", nightHours: hours, nightKwh: kwh });
  });
}

function washerRow(e: LoadEntry | undefined): LoadRow {
  const kw = LOAD_DEFAULT_KW.washer;
  const label = "เครื่องซักผ้า";
  if (!e) return row("washer", label, { size: kwText(kw) });
  if (e.unknown) return row("washer", label, { status: "unknown", size: kwText(kw) });
  const loads = e.loads_per_week;
  if (loads === 0) return row("washer", label, { status: "answered", qty: "0", size: kwText(kw), dayHours: 0, nightHours: 0, dayKwh: 0, nightKwh: 0 });
  const qty = loads !== undefined ? `${fmt(loads)} ครั้ง/สัปดาห์` : null;
  if (loads === undefined || !e.period) return row("washer", label, { status: "partial", qty, size: kwText(kw) });
  const hours = r2((loads * WASHER_HOURS_PER_LOAD) / 7);
  const kwh = r1(kw * hours);
  return row("washer", label, {
    status: "answered", qty, size: kwText(kw),
    dayHours: e.period === "day" ? hours : 0, nightHours: e.period === "night" ? hours : 0,
    dayKwh: e.period === "day" ? kwh : 0, nightKwh: e.period === "night" ? kwh : 0,
  });
}

function evRow(e: LoadEntry | undefined, hasEv: boolean, period: unknown, asked: boolean, defaultKw: number): LoadRow {
  const label = "ที่ชาร์จรถ EV";
  if (!hasEv) {
    return asked
      ? row("ev", label, { status: "answered", qty: "0", dayHours: 0, nightHours: 0, dayKwh: 0, nightKwh: 0 })
      : row("ev", label, {});
  }
  const kw = e?.charger_kw ?? defaultKw;
  const base = { qty: "1", size: kwText(kw) };
  if (!e) return row("ev", label, base);
  if (e.unknown) return row("ev", label, { ...base, status: "unknown" });
  const p = period === "day" || period === "night" ? period : null;
  if (e.sessions_per_week === undefined || e.hours_per_session === undefined || !p) {
    return row("ev", label, { ...base, status: "partial" });
  }
  const hours = r2((e.sessions_per_week * e.hours_per_session) / 7);
  const kwh = r1(kw * hours);
  return row("ev", label, {
    ...base, status: "answered",
    dayHours: p === "day" ? hours : 0, nightHours: p === "night" ? hours : 0,
    dayKwh: p === "day" ? kwh : 0, nightKwh: p === "night" ? kwh : 0,
  });
}

export function computeLoad(input: LoadInput): LoadResult {
  const profile = parseLoadProfile(input.load_profile);
  const asked = Object.keys(profile).length > 0;
  const fridge = profile.fridge;
  const rows: LoadRow[] = [
    ...acRows(profile, input.ac_split),
    // Fridge runs around the clock, so the only question is how many.
    !fridge ? row("fridge", "ตู้เย็น", { size: kwText(LOAD_DEFAULT_KW.fridge) })
      : fridge.unknown ? row("fridge", "ตู้เย็น", { status: "unknown", size: kwText(LOAD_DEFAULT_KW.fridge) })
        : hoursRow("fridge", "ตู้เย็น", { qty: fridge.qty, day_h: 12, night_h: 12 }, LOAD_DEFAULT_KW.fridge, ["day_h", "night_h"]),
    hoursRow("water_heater", "เครื่องทำน้ำอุ่น", profile.water_heater, LOAD_DEFAULT_KW.water_heater, ["day_min", "night_min"]),
    hoursRow("water_pump", "ปั๊มน้ำ", profile.water_pump, LOAD_DEFAULT_KW.water_pump, ["day_h", "night_h"]),
    washerRow(profile.washer),
    hoursRow("electronics", "ทีวี / เครื่องใช้ไฟฟ้าอิเล็กทรอนิกส์", profile.electronics, LOAD_DEFAULT_KW.electronics, ["day_h", "night_h"]),
    hoursRow("lighting", "หลอดไฟส่องสว่าง", profile.lighting, LOAD_DEFAULT_KW.lighting, ["day_h", "night_h"]),
    evRow(profile.ev, hasEvCharger(input.appliances), input.ev_charge_period, asked, defaultEvChargerKw(input.meter_size, input.electrical_phase)),
  ];
  const computed = rows.filter(r => r.dayKwh !== null || r.nightKwh !== null);
  const sum = (pick: (r: LoadRow) => number | null) => r1(computed.reduce((a, r) => a + (pick(r) ?? 0), 0));
  const dayKwh = computed.length ? sum(r => r.dayKwh) : null;
  const nightKwh = computed.length ? sum(r => r.nightKwh) : null;
  const total = (dayKwh ?? 0) + (nightKwh ?? 0);
  return {
    rows,
    dayKwh,
    nightKwh,
    nightShare: total > 0 ? (nightKwh ?? 0) / total : null,
    computedRows: computed.length,
    totalRows: rows.length,
    asked,
  };
}

// Share of the real bill the assumption explains — (kWh/day × 30) against
// bill ÷ ฿/kWh. Null when either side is missing.
export function loadBillCoverage(result: LoadResult, monthlyBill: unknown, rate: unknown): number | null {
  const bill = Number(monthlyBill);
  const unit = Number(rate) > 0 ? Number(rate) : DEFAULT_ELECTRICITY_RATE;
  const perDay = (result.dayKwh ?? 0) + (result.nightKwh ?? 0);
  if (!(bill > 0) || !(perDay > 0)) return null;
  return (perDay * 30) / (bill / unit);
}

// Questions still open, for the quotation submit gate (D4). "ไม่ทราบ" counts
// as answered — the point is that someone asked, not that the customer knew.
export function missingLoadAnswers(input: LoadInput): string[] {
  const result = computeLoad(input);
  const missing: string[] = [];
  const open = (key: string) => {
    const r = result.rows.find(x => x.key === key);
    return !r || r.status === "blank" || r.status === "partial";
  };
  const split = parseAcSplit(input.ac_split);
  const acUnits = split ? [...Object.values(split.day), ...Object.values(split.night)].reduce((a, n) => a + n, 0) : 0;
  if (acUnits > 0 && (open("ac_day") || open("ac_night"))) missing.push("ชั่วโมงเปิดแอร์");
  for (const key of ["fridge", "water_heater", "water_pump", "washer", "electronics", "lighting"] as const) {
    if (open(key)) missing.push(LOAD_DEVICES.find(d => d.key === key)!.label);
  }
  if (hasEvCharger(input.appliances)) {
    if (input.ev_charge_period !== "day" && input.ev_charge_period !== "night") missing.push("ช่วงชาร์จ EV");
    else if (open("ev")) missing.push("การชาร์จรถ EV");
  }
  return missing;
}

export function loadSummaryText(result: LoadResult): string {
  if (result.dayKwh === null) return "";
  const share = result.nightShare !== null ? ` (กลางคืน ${Math.round(result.nightShare * 100)}%)` : "";
  return `กลางวัน ${fmt(result.dayKwh)} kWh · กลางคืน ${fmt(result.nightKwh ?? 0)} kWh/วัน${share}`;
}
