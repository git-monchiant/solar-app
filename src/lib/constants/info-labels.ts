// Display labels for the customer-interest (`pre_*`) fields shown on the
// lead detail "Info" tab and elsewhere. Values mirror the form options
// in PreSurveyForm.tsx / CustomerWizard.tsx — keep in sync when adding
// new option values.

export const PEAK_USAGE_LABEL: Record<string, string> = {
  // Legacy values — older leads still hold these; questionnaire §2 moved
  // PreSurveyForm to the time-range picker. Keep both so display still
  // resolves regardless of when the lead was captured.
  day: "กลางวัน",
  night: "กลางคืน",
  both: "ทั้งสองช่วง",
  morning:   "06.00-12.00",
  afternoon: "12.00-18.00",
  evening:   "18.00-24.00",
  all_day:   "ตลอดวัน",
};

export const ELECTRICAL_PHASE_LABEL: Record<string, string> = {
  "1_phase": "1 เฟส",
  "3_phase": "3 เฟส",
  unknown:   "ไม่ทราบ",
};

export const METER_SIZE_LABEL: Record<string, string> = {
  "15_45":  "15(45) A",
  "30_100": "30(100) A",
  unknown:  "ไม่ทราบ",
};

export const BATTERY_INTEREST_LABEL: Record<string, string> = {
  yes: "ต้องการ",
  no: "ไม่ต้องการ",
  maybe: "ยังไม่แน่ใจ",
  upgrade: "Upgrade เพิ่มแบต",
};

export const ROOF_SHAPE_LABEL: Record<string, string> = {
  gable: "หน้าจั่ว",
  hip: "ปั้นหยา",
  shed: "เพิงหมาแหงน",
  flat: "ทรงแบน",
};

export const RESIDENCE_TYPE_LABEL: Record<string, string> = {
  detached: "บ้านเดี่ยว",
  townhome: "ทาวน์โฮม",
  townhouse: "ทาวน์เฮาส์",
  semi_detached: "บ้านแฝด",
  home_office: "โฮมออฟฟิศ",
  shophouse: "อาคารพาณิชย์",
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "เงินสด",
  finance: "ไฟแนนซ์",
  home_equity: "สินเชื่อบ้าน",
};

export const SOURCE_LABEL: Record<string, string> = {
  "walk-in": "SENX PM",
  event: "Event",
};

// Single source of truth for "เหตุผลที่สนใจ" — used by the seeker picker
// (ordered list) and the lead-detail Info tab (label lookup).
export const INTEREST_REASONS = [
  { code: "save_bill", label: "ประหยัดค่าไฟ" },
  { code: "sell_back", label: "ขายไฟคืน" },
  { code: "tax_deduction", label: "ลดหย่อนภาษี" },
  { code: "daytime_usage", label: "เปิดแอร์ทั้งวัน" },
  { code: "pet_ac", label: "แอร์ให้สัตว์เลี้ยง" },
  { code: "elderly_care", label: "ดูแลผู้สูงอายุ" },
  { code: "has_ev", label: "ชาร์จ EV" },
  { code: "environment", label: "รักษ์โลก" },
  { code: "home_business", label: "เปิดร้านที่บ้าน" },
  { code: "other", label: "อื่นๆ" },
] as const;

export const PRIMARY_REASON_LABEL: Record<string, string> = Object.fromEntries(
  INTEREST_REASONS.map((r) => [r.code, r.label])
);

export const APPLIANCE_INTEREST_LABEL: Record<string, string> = {
  water_heater: "เครื่องทำน้ำอุ่น",
  ev: "ที่ชาร์จรถ EV",
};

// Convenience aggregator — mirrors the legacy `INFO_LABELS` shape
// used by lead detail Info tab. Prefer importing the named maps
// directly when adding new code.
export const INFO_LABELS = {
  peakUsage: PEAK_USAGE_LABEL,
  electricalPhase: ELECTRICAL_PHASE_LABEL,
  battery: BATTERY_INTEREST_LABEL,
  roofShape: ROOF_SHAPE_LABEL,
  residence: RESIDENCE_TYPE_LABEL,
  payment: PAYMENT_METHOD_LABEL,
  source: SOURCE_LABEL,
  primaryReason: PRIMARY_REASON_LABEL,
  appliances: APPLIANCE_INTEREST_LABEL,
};
