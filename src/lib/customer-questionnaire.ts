// Single source of truth for the nine Customer Info / Pre-Survey sections.
// The form and Dashboard III both import these definitions so labels, option
// codes, bill boundaries, and factor keys cannot silently drift apart.

export const RESIDENCE_TYPES = [
  { value: "detached", label: "บ้านเดี่ยว" },
  { value: "semi_detached", label: "บ้านแฝด" },
  { value: "townhome", label: "ทาวน์โฮม" },
  { value: "townhouse", label: "ทาวน์เฮาส์" },
  { value: "home_office", label: "โฮมออฟฟิศ" },
  { value: "shophouse", label: "อาคารพาณิชย์" },
  { value: "other", label: "อื่นๆ" },
] as const;

export const HOUSE_AGES = [
  { value: "lt5", label: "ต่ำกว่า 5 ปี" },
  { value: "5_10", label: "5-10 ปี" },
  { value: "10_20", label: "10-20 ปี" },
  { value: "gt20", label: "มากกว่า 20 ปี" },
] as const;

export const ROOF_SHAPES = [
  { value: "old_tile", label: "กระเบื้องลอนคู่" },
  { value: "cpac_tile", label: "กระเบื้องคอนกรีต / ซีแพค" },
  { value: "metal_sheet", label: "เมทัลชีท" },
  { value: "flat_tile", label: "กระเบื้องแผ่นเรียบ" },
  { value: "concrete", label: "ดาดฟ้าคอนกรีต" },
  { value: "unknown", label: "ไม่ทราบ" },
  { value: "other", label: "อื่นๆ" },
] as const;

export const ELECTRICAL_PHASES = [
  { value: "1_phase", label: "1 เฟส" },
  { value: "3_phase", label: "3 เฟส" },
  { value: "unknown", label: "ไม่ทราบ" },
] as const;

export const METER_SIZES = [
  { value: "15_45", label: "15(45) A" },
  { value: "30_100", label: "30(100) A" },
  { value: "other", label: "อื่นๆ" },
  { value: "unknown", label: "ไม่ทราบ" },
] as const;

export const PEAK_USAGE = [
  { value: "morning", label: "06.00-12.00" },
  { value: "afternoon", label: "12.00-18.00" },
  { value: "evening", label: "18.00-24.00" },
  { value: "all_day", label: "ตลอดวัน" },
] as const;

export const MONTHLY_BILL_BUCKETS = [
  { value: "lt2k", label: "ต่ำกว่า 2,000 บาท", min: null, max: 2000, maxInclusive: false },
  { value: "2k4k", label: "2,000–ต่ำกว่า 4,000 บาท", min: 2000, max: 4000, maxInclusive: false },
  { value: "4k6k", label: "4,000–ต่ำกว่า 6,000 บาท", min: 4000, max: 6000, maxInclusive: false },
  { value: "6k10k", label: "6,000-10,000 บาท", min: 6000, max: 10000, maxInclusive: true },
  { value: "gt10k", label: "มากกว่า 10,000 บาท", min: 10000, max: null, maxInclusive: false },
] as const;

export function monthlyBillBucket(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < 2000) return "lt2k";
  if (value < 4000) return "2k4k";
  if (value < 6000) return "4k6k";
  if (value <= 10000) return "6k10k";
  return "gt10k";
}

export const YES_NO = [
  { value: "yes", label: "ใช่" },
  { value: "no", label: "ไม่ใช่" },
] as const;

export const DAYTIME_OCCUPANTS = [
  { value: "family", label: "ทั้งครอบครัว" },
  { value: "elderly", label: "ผู้สูงอายุ" },
  { value: "kids", label: "เด็กเล็ก" },
  { value: "pets", label: "สัตว์เลี้ยง" },
] as const;

export const BUSINESS_TYPES = [
  { value: "online_live", label: "ขายของ Online / Live" },
  { value: "online_edu", label: "เรียน Online" },
  { value: "retail", label: "ค้าขาย" },
  { value: "other", label: "อื่นๆ" },
] as const;

export const WORK_DAYS_PER_WEEK = [
  { value: "1_2", label: "1-2 วัน/สัปดาห์" },
  { value: "3_5", label: "3-5 วัน/สัปดาห์" },
  { value: "daily", label: "ทุกวัน" },
] as const;

export const AC_TIERS = [
  { key: "9000", label: "9,000 BTU" },
  { key: "12000", label: "12,000 BTU" },
  { key: "18000", label: "18,000 BTU" },
  { key: "24000", label: "24,000 BTU" },
  { key: "gt24000", label: ">24,000 BTU" },
] as const;

export const EV_CHARGE_PERIODS = [
  { value: "day", label: "กลางวัน" },
  { value: "night", label: "กลางคืน" },
] as const;

export const YES_NO_CONSIDERING = [
  { value: "yes", label: "มี" },
  { value: "no", label: "ไม่มี" },
  { value: "considering", label: "กำลังพิจารณา" },
] as const;

export const YES_NO_BIN = [
  { value: "yes", label: "มี" },
  { value: "no", label: "ไม่มี" },
] as const;

export const YES_NO_MAYBE = [
  { value: "yes", label: "มี" },
  { value: "no", label: "ไม่มี" },
  { value: "maybe", label: "ยังไม่แน่ใจ" },
] as const;

export const OUTAGE_PRIORITIES = [
  { value: "ac", label: "แอร์" },
  { value: "lights", label: "ไฟส่องสว่าง" },
  { value: "internet", label: "Internet" },
  { value: "cctv", label: "กล้องวงจรปิด" },
  { value: "fridge", label: "ตู้เย็น" },
  { value: "ev_charger", label: "EV Charger" },
  { value: "gate", label: "ระบบประตูรั้ว" },
  { value: "ups", label: "ระบบสำรองฉุกเฉิน" },
  { value: "other", label: "อื่นๆ" },
] as const;

export const BILL_RISE_ACTIONS = [
  { value: "now", label: "ลดค่าไฟทันที" },
  { value: "longterm", label: "ควบคุมค่าใช้จ่ายระยะยาว" },
  { value: "prepare", label: "เตรียมบ้านประหยัดพลังงาน" },
] as const;

export const EVER_NEVER = [
  { value: "yes", label: "เคย" },
  { value: "no", label: "ไม่เคย" },
] as const;

export const ABLE_OR_NOT = [
  { value: "yes", label: "ได้" },
  { value: "no", label: "ไม่ได้" },
] as const;

export const EV_READY_OPTIONS = [
  { value: "ready", label: "พร้อม" },
  { value: "not_yet", label: "ยังไม่พร้อม" },
  { value: "unsure", label: "ไม่แน่ใจ" },
] as const;

export const USAGE_TREND_OPTIONS = [
  { value: "more", label: "มากขึ้น" },
  { value: "same", label: "เท่าเดิม" },
  { value: "less", label: "น้อยลง" },
] as const;

export const DECISION_TIMELINES = [
  { value: "1-3m", label: "ภายใน 1-3 เดือน" },
  { value: "6m", label: "ภายใน 6 เดือน" },
  { value: "1y+", label: "มากกว่า 1 ปี" },
  { value: "other", label: "อื่นๆ" },
] as const;

export const DECISION_FACTORS = [
  { key: "company_reliable", label: "บริษัทที่น่าเชื่อถือ มีทีมดูแลตลอดอายุการใช้งานระบบโซลาร์ อีก 30 ปีข้างหน้า" },
  { key: "home_understanding", label: "เข้าใจโครงสร้างบ้าน หลังคา และระบบไฟฟ้าในบ้านของคุณ" },
  { key: "equipment_standard", label: "มาตรฐานอุปกรณ์ที่ดีที่สุด" },
  { key: "engineer_design", label: "มีวิศวกรออกแบบระบบให้เหมาะกับการใช้งานจริงของคุณ" },
  { key: "financial_advisor", label: "มีทีมที่ปรึกษาด้านการเงิน" },
  { key: "installment_loan", label: "มีบริการผ่อนชำระหรือสินเชื่อ" },
  { key: "affordable_price", label: "ราคาย่อมเยา" },
] as const;


export const BATTERY_OPTIONS = [
  { value: "no", label: "ไม่ต้องการ" },
  { value: "yes", label: "ต้องการ" },
  { value: "maybe", label: "ยังไม่แน่ใจ" },
  { value: "upgrade", label: "+ Upgrade" },
] as const;

// §1 Customer Demographics. Single-choice codes; `occupation` also accepts the
// shared "other:<free text>" pattern that optionLabel() below decodes.
// (Stored by migration 153, which predates the renumber and still says §9.)
export const OCCUPATIONS = [
  { value: "business_owner", label: "เจ้าของกิจการ" },
  { value: "private_employee", label: "พนง.บริษัทเอกชน" },
  { value: "government", label: "รับราชการ/รัฐวิสาหกิจ" },
  { value: "homemaker", label: "แม่บ้าน/พ่อบ้าน" },
  { value: "freelance", label: "อาชีพอิสระ" },
  { value: "medical", label: "แพทย์/พยาบาล" },
  { value: "retired", label: "เกษียณอายุ" },
  { value: "other", label: "อื่นๆ" },
] as const;

// Buckets are contiguous on purpose — the paper form's "ต่ำกว่า 20 / 21-30"
// left age 20 with nowhere to go, so the first bucket is "ต่ำกว่า 21 ปี".
// `short` is the axis form: the full label is what the form, the drilldown
// table and the Excel export say, but it does not fit under a column on
// Dashboard III. Only the charts read `short`; nothing else may substitute it.
export const AGE_RANGES = [
  { value: "lt21", label: "ต่ำกว่า 21 ปี", short: "<21" },
  { value: "21_30", label: "21-30 ปี", short: "21–30" },
  { value: "31_40", label: "31-40 ปี", short: "31–40" },
  { value: "41_50", label: "41-50 ปี", short: "41–50" },
  { value: "51_60", label: "51-60 ปี", short: "51–60" },
  { value: "gte61", label: "61 ปีขึ้นไป", short: "61+" },
] as const;

// "ไม่สะดวกให้ข้อมูล" is a real stored answer, not NULL — declining to answer
// and never being asked are different facts, and collapsing them into NULL
// would skew every `answered` count on Dashboard III.
// Axis forms switch from หมื่น to แสน at 100,000 because that is how the
// amount is said out loud — "10–15 หมื่น" is not Thai. The unit word rides
// along on every label, so the two scales never get confused.
export const HOUSEHOLD_INCOMES = [
  { value: "lt30k", label: "ต่ำกว่า 30,000 บาท", short: "< 3 หมื่น" },
  { value: "30k_50k", label: "30,000–49,999 บาท", short: "3–5 หมื่น" },
  { value: "50k_75k", label: "50,000–74,999 บาท", short: "5–7.5 หมื่น" },
  { value: "75k_100k", label: "75,000–99,999 บาท", short: "7.5–10 หมื่น" },
  { value: "100k_150k", label: "100,000–149,999 บาท", short: "1–1.5 แสน" },
  { value: "gte150k", label: "150,000 บาทขึ้นไป", short: "1.5 แสน+" },
  { value: "no_answer", label: "ไม่สะดวกให้ข้อมูล", short: "ไม่ตอบ" },
] as const;

// The payment form the customer is interested in — asked right after household
// income because the two answer the same question about what they can and want
// to pay. Single-select: one code on lead_data.payment_interest (migration
// 194), NULL until answered.
//
// Distinct from PAYMENT_TYPES in lib/constants/statuses.ts: that list is the
// method used to pay the pre-survey fee, picked once the deal is real. This one
// is what the customer SAYS they are interested in while still a lead, so the
// two can (and should) be compared later.
export const PAYMENT_INTERESTS = [
  { value: "cash", label: "เงินสด / โอนเงิน" },
  { value: "loan", label: "สินเชื่อ / กู้ธนาคาร" },
  { value: "credit_card", label: "บัตรเครดิต" },
] as const;

// Array order IS the order every surface presents the questionnaire in — the
// form, the Customer Info tab, Dashboard III's cards, and the Excel column
// groups. `id` is just that position spelled out for the badges and group
// labels; `key` is the stable identifier, so reordering renumbers nothing that
// code depends on (nothing reads `id`, and the aggregate helpers below iterate
// order-independently).
//
// Heads up when reading the rest of the codebase: the `§N (migration NNN)`
// comments on lead_data columns use the order the sections were BUILT, which
// stopped matching these ids when demographics moved to the front. Match on
// `key` / column name, never on the number in those comments.
export const QUESTIONNAIRE_SECTIONS = [
  { id: 1, key: "demographics", title: "Customer Demographics", subtitle: "ข้อมูลลูกค้า", fields: ["occupation", "age_range", "household_income", "payment_interest"] },
  { id: 2, key: "customer_profile", title: "Customer Profile", subtitle: "ข้อมูลบ้านและผู้อยู่อาศัย", fields: ["residence_type", "house_age", "roof_shape", "occupant_total", "occupant_elderly", "occupant_kids", "occupant_pets"] },
  { id: 3, key: "energy_profile", title: "Energy Profile", subtitle: "การใช้พลังงานปัจจุบัน", fields: ["monthly_bill", "monthly_bill_max", "electrical_phase", "meter_size", "peak_usage"] },
  { id: 4, key: "lifestyle", title: "Lifestyle Assessment", subtitle: "รูปแบบการใช้ชีวิต", fields: ["home_at_daytime", "daytime_occupants", "work_at_home", "business_type", "work_days_per_week", "ac_split", "appliances", "ev_charge_period"] },
  { id: 5, key: "future_home", title: "Future Home Assessment", subtitle: "แผนบ้านใน 5 ปี", fields: ["future_ev", "future_ev_charger", "future_extend_home", "future_more_members", "future_smart_home", "future_battery"] },
  { id: 6, key: "energy_security", title: "Energy Security Assessment", subtitle: "ความมั่นคงด้านพลังงาน", fields: ["outage_priorities", "bill_rise_action"] },
  { id: 7, key: "home_health", title: "Home Health Check", subtitle: "สุขภาพบ้าน", fields: ["had_roof_leak", "did_roof_repair", "had_electrical_issue", "did_panel_replacement"] },
  { id: 8, key: "beyond", title: "Beyond Question", subtitle: "ความพร้อมด้านพลังงานในอนาคต", fields: ["self_generates", "ev_ready", "blackout_resilient", "future_usage_trend"] },
  { id: 9, key: "decision", title: "Decision Making Factor", subtitle: "การตัดสินใจติดตั้ง", fields: ["decision_factors", "decision_timeline"] },
] as const;

// Short Thai label per questionnaire field, for surfaces that list a section's
// answers one after another (the drilldown behind a card's headline figure).
// The Excel export keeps its own spreadsheet-header wording; these are the
// in-app names, and both are read from this module's field keys.
export const FIELD_LABELS: Record<string, string> = {
  occupation: "อาชีพ", age_range: "อายุ", household_income: "รายได้ครัวเรือน/เดือน",
  payment_interest: "รูปแบบการชำระเงินที่สนใจ",
  residence_type: "ประเภทที่อยู่อาศัย", house_age: "อายุบ้าน", roof_shape: "ประเภทหลังคา",
  occupant_total: "จำนวนผู้อยู่อาศัย", occupant_elderly: "จำนวนผู้สูงอายุ",
  occupant_kids: "จำนวนเด็ก", occupant_pets: "จำนวนสัตว์เลี้ยง",
  monthly_bill: "ค่าไฟเฉลี่ยต่อเดือน", monthly_bill_max: "ค่าไฟสูงสุดต่อเดือน",
  electrical_phase: "ระบบไฟปัจจุบัน", meter_size: "ขนาดมิเตอร์", peak_usage: "ช่วงเวลาที่ใช้ไฟสูงสุด",
  home_at_daytime: "อยู่บ้านช่วงกลางวัน", daytime_occupants: "ผู้อยู่บ้านช่วงกลางวัน",
  work_at_home: "ทำงาน/ทำธุรกิจที่บ้าน", business_type: "ประเภทธุรกิจที่บ้าน",
  work_days_per_week: "จำนวนวันทำงานที่บ้าน", ac_split: "จำนวนแอร์", appliances: "อุปกรณ์/ที่ชาร์จ EV",
  ev_charge_period: "ช่วงเวลาชาร์จ EV",
  future_ev: "แผนซื้อรถยนต์ EV", future_ev_charger: "แผนติดตั้ง EV Charger",
  future_extend_home: "แผนต่อเติมบ้าน", future_more_members: "แผนเพิ่มสมาชิกในบ้าน",
  future_smart_home: "แผนติดตั้ง Smart Home", future_battery: "แผนติดตั้ง Battery",
  outage_priorities: "อุปกรณ์สำคัญเมื่อไฟดับ", bill_rise_action: "การรับมือเมื่อค่าไฟเพิ่ม 30%",
  had_roof_leak: "เคยมีหลังคารั่ว", did_roof_repair: "เคยซ่อมหลังคา",
  had_electrical_issue: "เคยมีปัญหาระบบไฟ", did_panel_replacement: "เคยเปลี่ยนตู้ควบคุมไฟ",
  self_generates: "บ้านผลิตไฟใช้เองได้", ev_ready: "ความพร้อมรองรับ EV",
  blackout_resilient: "ใช้ชีวิตได้ตามปกติเมื่อไฟดับ", future_usage_trend: "แนวโน้มใช้ไฟใน 10 ปี",
  decision_timeline: "ระยะเวลาตัดสินใจ", decision_factors: "คะแนนปัจจัยตัดสินใจ",
};

export function optionLabel(options: readonly { value: string; label: string }[], raw: string | null | undefined): string {
  if (!raw) return "—";
  const base = raw.startsWith("other:") ? "other" : raw;
  const label = options.find(o => o.value === base)?.label;
  if (raw.startsWith("other:")) return `${label || "อื่นๆ"}: ${raw.slice(6).trim()}`;
  return label || raw;
}
