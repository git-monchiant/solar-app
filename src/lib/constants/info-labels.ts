// Display labels for the customer-interest (`pre_*`) fields shown on the
// lead detail "Info" tab and elsewhere. Values mirror the form options
// in PreSurveyForm.tsx / CustomerWizard.tsx — keep in sync when adding
// new option values.

export const PEAK_USAGE_LABEL: Record<string, string> = {
  day: "กลางวัน",
  night: "กลางคืน",
  both: "ทั้งสองช่วง",
};

export const ELECTRICAL_PHASE_LABEL: Record<string, string> = {
  "1_phase": "1 เฟส",
  "3_phase": "3 เฟส",
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

export const PRIMARY_REASON_LABEL: Record<string, string> = {
  save_bill: "ประหยัดค่าไฟ",
  sell_back: "ขายไฟคืน",
  tax_deduction: "ลดหย่อนภาษี",
  daytime_usage: "เปิดแอร์ทั้งวัน",
  pet_ac: "แอร์ให้สัตว์เลี้ยง",
  elderly_care: "ดูแลผู้สูงอายุ",
  has_ev: "ชาร์จ EV",
  environment: "รักษ์โลก",
  home_business: "เปิดร้านที่บ้าน",
  other: "อื่นๆ",
};

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
