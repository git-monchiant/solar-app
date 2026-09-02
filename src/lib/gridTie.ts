// ── ชุดยื่นคำขอขนานไฟ ───────────────────────────────────────────────────────
// โครงสร้างตามฟอร์มกระดาษของทีม Permit (`File Permit : Up 20082026`)
// แผน: docs/plan/20260831-01-gridtie-permit-checklist-redesign.md
//
// รายการทั้งหมดโผล่พร้อมกันเสมอ — ไม่มีเงื่อนไขซ่อน/แสดงตาม MEA/PEA หรือเจตนา
// คนกรอกเป็นคนตัดสินเองว่าแถวไหนเกี่ยวกับงานนี้ (ตัดสินใจ 2 ก.ย. 2026)
// มีแค่ applicantType (individual | juristic) ที่เลือกว่าใช้ชุดเอกสารชุดไหน
//
// สถานะของแต่ละแถวมี 2 ชั้น แยกคนละคน:
//   received  ตรวจรับหน้างาน — เซลล์หรือทีมติดตั้ง ใครหยิบก่อนก็ติ๊กได้ (ช่องเดียว)
//   permit    ฝ่ายที่ยื่น MEA/PEA จริงยืนยันว่าได้เอกสารแล้ว
// ทั้งสองชั้นเป็นข้อมูลติดตามงานเท่านั้น — ไม่บล็อกการปิดงาน

export type GridTieApplicantType = "individual" | "juristic";
export type GridTieMode = "parallel" | "sell" | "cod";
export type GridTiePermitState = "has" | "none";

/** ป้ายกำกับว่าใครรับผิดชอบ — เป็นข้อมูลอ่านอย่างเดียว ไม่ผูกกับสิทธิ์ติ๊ก */
export type GridTieOwner = "sale" | "install" | "both";

export interface GridTieFieldDef {
  key: string;
  label: string;
  /** ตัวเลือกแบบ dropdown — ไม่ใส่ = ช่องพิมพ์อิสระ */
  options?: readonly { value: string; label: string }[];
  suffix?: string;
}

export interface GridTieChecklistItem {
  id: string;
  label: string;
  detail?: string;
  owner: GridTieOwner;
  section: "doc" | "equipment";
  /** ชุดนิติบุคคลใช้ — ต้องติ๊ก "จำเป็นสำหรับงานนี้" ก่อนถึงจะกดได้และถูกนับ */
  conditional?: boolean;
  /** อุปกรณ์ทุกกลุ่มมีธง Datasheet มี/ไม่มี */
  datasheet?: boolean;
  fields?: readonly GridTieFieldDef[];
  /** ข้อความบอกที่มาของค่าที่เติมให้อัตโนมัติ — แสดงเป็นป้ายในฟอร์ม */
  autofill?: string;
}

export interface GridTieChecklistEntry {
  /** ตรวจรับหน้างานแล้ว */
  received?: boolean;
  /** ฝ่าย Permit ยืนยัน */
  permit?: GridTiePermitState | null;
  /** อุปกรณ์: มี datasheet ไหม */
  datasheet?: GridTiePermitState | null;
  note?: string;
  files?: string[];
  fields?: Record<string, string>;
  /** ใช้กับแถว conditional เท่านั้น */
  required?: boolean;
}

export type GridTieChecklistState = Record<string, GridTieChecklistEntry>;

// ── ตัวเลือกที่ใช้ซ้ำ ────────────────────────────────────────────────────────

// ขั้นตอนกับการไฟฟ้าหลังยื่นคำขอ — 5 วันที่นี้มีคอลัมน์ใน leads มาตั้งแต่ sql/052
// แต่ไม่เคยมีหน้าจอไหนกรอก นิยามไว้ที่เดียวเพื่อให้ฟอร์มกับหน้าสรุปใช้ลำดับและคำเดียวกัน
// (คำเดียวกับที่ Timeline บน branch quotation ใช้ เพื่อไม่ให้ขัดกันตอน merge)
export const GRID_TIE_MILESTONES = [
  { key: "grid_erc_submitted_date", label: "ยื่นเอกสาร ERC" },
  { key: "grid_submitted_date", label: "ยื่นคำขอขนานไฟ" },
  { key: "grid_inspection_date", label: "ตรวจระบบขนานไฟ" },
  { key: "grid_approved_date", label: "อนุมัติขนานไฟ" },
  { key: "grid_meter_changed_date", label: "เปลี่ยนมิเตอร์เรียบร้อย" },
] as const;

export type GridTieMilestoneKey = (typeof GRID_TIE_MILESTONES)[number]["key"];

/**
 * วันที่ที่ย้อนหลังกว่าขั้นก่อนหน้า — คืน key ของขั้นที่ผิดลำดับ
 * ใช้เตือนเฉย ๆ ไม่บล็อกการบันทึก เพราะงานจริงมีเคสที่ลำดับสลับได้
 */
export function getGridTieOutOfOrderMilestones(
  dates: Partial<Record<GridTieMilestoneKey, string | null>>,
): GridTieMilestoneKey[] {
  const out: GridTieMilestoneKey[] = [];
  let previous: { key: GridTieMilestoneKey; value: string } | null = null;
  for (const milestone of GRID_TIE_MILESTONES) {
    const value = dates[milestone.key];
    if (!value) continue;
    if (previous && value < previous.value) out.push(milestone.key);
    previous = { key: milestone.key, value };
  }
  return out;
}

/**
 * เจตนาของงาน — ใช้เป็นตัวเลือกของช่อง `intent` ในแถว "หนังสือแสดงเจตนา"
 * เก็บไว้ใน checklist JSON ที่เดียว ไม่มีคอลัมน์แยก (ตัดสินใจ 2 ก.ย. 2026)
 */
export const GRID_TIE_MODES = [
  { value: "parallel", label: "ขนานไฟอย่างเดียว" },
  { value: "sell", label: "ขายไฟ" },
  { value: "cod", label: "COD" },
] as const;

// ค่าเดียวกับ METER_SIZES / ELECTRICAL_PHASES ใน customer-questionnaire.ts
// เขียนซ้ำที่นี่เพราะฟอร์มขนานไฟต้องมี "อื่น ๆ" ที่พิมพ์เองได้ ส่วนแบบสอบถามไม่ต้อง
const METER_SIZE_OPTIONS = [
  { value: "15_45", label: "15(45) A" },
  { value: "30_100", label: "30(100) A" },
  { value: "other", label: "อื่นๆ" },
] as const;

const PHASE_OPTIONS = [
  { value: "1", label: "1 เฟส" },
  { value: "3", label: "3 เฟส" },
] as const;

// ── เอกสารฝั่งหน้างาน — เหมือนกันทั้งบุคคลธรรมดาและนิติบุคคล ─────────────────

const SITE_DOCS: readonly GridTieChecklistItem[] = [
  {
    id: "site_coordinates", section: "doc", owner: "both",
    label: "พิกัดสถานที่ติดตั้ง", detail: "ละติจูด / ลองจิจูด · Google Map",
    fields: [
      { key: "lat", label: "ละติจูด" },
      { key: "lng", label: "ลองจิจูด" },
      { key: "map_url", label: "ลิงก์ Google Map" },
    ],
  },
  {
    id: "site_photo_timestamp", section: "doc", owner: "install",
    label: "รูปถ่ายหน้าบ้าน", detail: "ต้องมี time stamp ตรงกับสถานที่ติดตั้ง",
  },
  {
    id: "single_line_diagram", section: "doc", owner: "install",
    label: "แบบระบบไฟฟ้า Single Line", detail: "พร้อมตำแหน่งติดตั้งอุปกรณ์",
  },
  {
    id: "engineer_cert", section: "doc", owner: "install",
    label: "หนังสือรับรองวิศวกร + ใบ กว.",
  },
  {
    id: "architect_cert", section: "doc", owner: "install",
    label: "หนังสือรับรองสถาปนิก + ใบ กส.",
  },
  {
    id: "boq_quotation", section: "doc", owner: "install",
    label: "ใบเสนอราคา / BOQ", autofill: "ใบเสนอราคาที่อนุมัติ",
  },
];

// ── ชุดบุคคลธรรมดา — ยกจากฟอร์มกระดาษ 14 แถว ────────────────────────────────

const INDIVIDUAL_DOCS: readonly GridTieChecklistItem[] = [
  {
    id: "electricity_bill", section: "doc", owner: "sale",
    label: "สำเนาใบแจ้งค่าไฟ", detail: "ชื่อต้องตรงกับผู้ใช้ไฟเดิม",
    autofill: "รูปบิลจาก Pre-Survey",
    fields: [
      { key: "customer_type", label: "ประเภทผู้ใช้ไฟ" },
      { key: "meter_size", label: "ขนาดเครื่องวัด", options: METER_SIZE_OPTIONS },
      { key: "voltage", label: "แรงดัน", suffix: "V" },
      { key: "phase", label: "จำนวนเฟส", options: PHASE_OPTIONS },
      { key: "wire", label: "จำนวนสาย", suffix: "สาย" },
    ],
  },
  {
    id: "premise_consent", section: "doc", owner: "sale",
    label: "หนังสือยินยอมของผู้ครอบครองอาคาร / สถานที่",
    fields: [{ key: "owner_name", label: "ชื่อเจ้าของเรื่อง" }],
  },
  {
    id: "bank_account_notice", section: "doc", owner: "sale",
    label: "หนังสือแจ้งเลขที่บัญชีธนาคาร",
    fields: [{ key: "bank_account_no", label: "เลขที่บัญชี" }],
  },
  {
    id: "bank_book_copy", section: "doc", owner: "sale",
    label: "สำเนาบัญชีธนาคารหน้าแรก",
    fields: [{ key: "bank_name", label: "ธนาคาร" }],
  },
  {
    id: "intent_letter", section: "doc", owner: "sale",
    label: "หนังสือแสดงเจตนา", detail: "ขายไฟ / ขนานไฟ / ภาษี",
    fields: [{ key: "intent", label: "เจตนา", options: GRID_TIE_MODES }],
  },
  {
    id: "id_card", section: "doc", owner: "sale",
    label: "สำเนาบัตรประชาชน", detail: "เจ้าของบ้าน / ผู้มอบอำนาจ",
  },
  {
    id: "house_registration", section: "doc", owner: "sale",
    label: "สำเนาทะเบียนบ้าน", detail: "เจ้าของบ้าน / ผู้มอบอำนาจ",
  },
  {
    id: "solar_house_registration", section: "doc", owner: "sale",
    label: "สำเนาทะเบียนบ้าน", detail: "บ้านที่ติดตั้ง Solar",
  },
  ...SITE_DOCS,
];

// ── ชุดนิติบุคคล — คงรายการเดิมของแอปไว้ทั้งหมด ──────────────────────────────
//
// ไม่ยกฟอร์มกระดาษของทีม Permit มาใช้กับชุดนี้ (ตัดสินใจ 2 ก.ย. 2026) เพราะฟอร์มนั้น
// เขียนขึ้นสำหรับบุคคลธรรมดา ชุดนิติบุคคลจึงเป็นเอกสารฝั่งลูกค้าล้วน ๆ เหมือนเดิม
// ไม่มีส่วนงานหน้างานและไม่มีส่วนอุปกรณ์
//
// id เดิมทุกตัว — ห้ามเปลี่ยน ไม่งั้นติ๊กของ Lead เก่าที่ parseGridTieChecklist()
// แปลงมาจาก `MEA:juristic:<id>` จะจับคู่ไม่ติด

const JURISTIC_DOCS: readonly GridTieChecklistItem[] = [
  {
    id: "power_of_attorney", section: "doc", owner: "sale",
    label: "หนังสือมอบอำนาจ", detail: "ลงนามกรรมการผู้มีอำนาจและประทับตราบริษัท",
  },
  {
    id: "tax_measure_consent", section: "doc", owner: "sale",
    label: "หนังสือยินยอมเข้าร่วมโครงการมาตรการทางภาษี",
    detail: "ฉบับที่ 805 พ.ศ. 2569 ตามเอกสารแนบ (เฉพาะ MEA)",
  },
  {
    id: "latest_electricity_bill", section: "doc", owner: "sale",
    label: "สำเนาใบแจ้งค่าไฟเดือนล่าสุด", detail: "ชื่อผู้มอบอำนาจต้องตรงกับชื่อในใบแจ้งค่าไฟ",
    autofill: "รูปบิลจาก Pre-Survey",
  },
  {
    id: "company_certificate", section: "doc", owner: "sale",
    label: "หนังสือรับรองบริษัท อายุไม่เกิน 3 เดือน",
    detail: "ลงนามกรรมการผู้มีอำนาจและประทับตราบริษัท",
  },
  {
    id: "director_id_card", section: "doc", owner: "sale",
    label: "สำเนาบัตรประชาชนของกรรมการผู้ลงนาม", detail: "กรรมการผู้มีอำนาจลงนาม",
  },
  {
    id: "director_house_registration", section: "doc", owner: "sale",
    label: "สำเนาทะเบียนบ้านของกรรมการผู้ลงนาม", detail: "กรรมการผู้มีอำนาจลงนาม",
  },
  {
    id: "post_solar_house_registration", section: "doc", owner: "sale", conditional: true,
    label: "สำเนาทะเบียนบ้านหลังติดตั้ง Solar",
    detail: "เอกสารเพิ่มเติม กรณีลูกค้ายังไม่ย้ายทะเบียนบ้าน",
  },
];

// ── รายละเอียดทางเทคนิค 5 กลุ่ม — งานทีมติดตั้ง เฉพาะชุดบุคคลธรรมดา ──────────

const EQUIPMENT: readonly GridTieChecklistItem[] = [
  {
    id: "panel", section: "equipment", owner: "install", datasheet: true,
    label: "แผงเซลล์ Solar", autofill: "ใบตรวจติดตั้ง",
    fields: [
      { key: "brand", label: "ยี่ห้อ" },
      { key: "model", label: "รุ่น" },
      { key: "watt", label: "ขนาดต่อแผง", suffix: "W" },
      { key: "count", label: "จำนวน", suffix: "แผง" },
    ],
  },
  {
    id: "inverter", section: "equipment", owner: "install", datasheet: true,
    label: "Inverter", detail: "แนบรูปถ่ายพร้อมป้าย S/N", autofill: "ใบตรวจติดตั้ง",
    fields: [
      { key: "brand", label: "ยี่ห้อ" },
      { key: "model", label: "รุ่น" },
      { key: "kw", label: "ขนาดพิกัด", suffix: "kW" },
      { key: "count", label: "จำนวน", suffix: "ตัว" },
      { key: "sn", label: "S/N" },
    ],
  },
  {
    id: "zero_export", section: "equipment", owner: "install", datasheet: true,
    label: "อุปกรณ์ Zero Export / กันไหลย้อน", detail: "พร้อมจุดเชื่อมต่อ",
    fields: [
      { key: "brand", label: "ยี่ห้อ" },
      { key: "model", label: "รุ่น" },
      { key: "connection_point", label: "จุดเชื่อมต่อ" },
    ],
  },
  {
    id: "ct", section: "equipment", owner: "install", datasheet: true,
    label: "Current Transformer (CT)",
    fields: [
      { key: "brand", label: "ยี่ห้อ" },
      { key: "model", label: "รุ่น" },
      { key: "rating_a", label: "พิกัด", suffix: "A" },
      { key: "rating_ma", label: "พิกัด", suffix: "mA" },
      { key: "class", label: "Class" },
      { key: "iec", label: "มาตรฐาน IEC" },
    ],
  },
  {
    id: "battery", section: "equipment", owner: "install", datasheet: true,
    label: "Battery Energy Storage System", detail: "เฉพาะงานที่มีแบตเตอรี่",
    autofill: "ใบตรวจติดตั้ง",
    fields: [
      { key: "brand", label: "ยี่ห้อ" },
      { key: "model", label: "รุ่น" },
      { key: "count", label: "จำนวน", suffix: "ตัว" },
      { key: "capacity_ah", label: "Capacity", suffix: "Ah" },
      { key: "capacity_kwh", label: "Capacity", suffix: "kWh" },
      { key: "capacity_kw", label: "Capacity", suffix: "kW" },
    ],
  },
];

// ── การเลือกรายการ ──────────────────────────────────────────────────────────

/**
 * รายการทั้งหมดของงานนี้
 *   บุคคลธรรมดา — 14 แถวตามฟอร์มกระดาษ + อุปกรณ์ 5 กลุ่ม
 *   นิติบุคคล   — รายการเดิมของแอป เอกสารฝั่งลูกค้าล้วน ไม่มีส่วนอุปกรณ์
 */
export function getGridTieChecklistItems(applicantType: string): GridTieChecklistItem[] {
  if (!applicantType) return [];
  if (applicantType === "juristic") return [...JURISTIC_DOCS];
  return [...INDIVIDUAL_DOCS, ...EQUIPMENT];
}

// ── อ่าน / แปลงข้อมูลเก่า ───────────────────────────────────────────────────

/**
 * Lead เดิมเก็บ key แบบ `MEA:individual:id_card` และสถานะเป็น `status: "received"`
 * แปลงตอนอ่านแทนการทำ migration — ตัดหัวทิ้งแล้วยกสถานะขึ้นเป็นทั้งสองชั้น
 * (ของเดิมมีชั้นเดียว ถ้าเคยติ๊กว่าได้รับ แปลว่าฝ่าย Permit ก็ได้เอกสารนั้นแล้ว)
 */
export function parseGridTieChecklist(value: string | null | undefined): GridTieChecklistState {
  if (!value) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

  const out: GridTieChecklistState = {};
  for (const [rawKey, rawEntry] of Object.entries(parsed as Record<string, unknown>)) {
    if (!rawEntry || typeof rawEntry !== "object") continue;
    // ตัด prefix `<UTILITY>:<applicantType>:` ของรูปแบบเดิมออก
    const key = rawKey.includes(":") ? rawKey.slice(rawKey.lastIndexOf(":") + 1) : rawKey;
    const entry = rawEntry as Record<string, unknown>;

    const legacyStatus = typeof entry.status === "string" ? entry.status : null;
    const received = typeof entry.received === "boolean"
      ? entry.received
      : legacyStatus === "received";

    const next: GridTieChecklistEntry = {
      received,
      permit: entry.permit === "has" || entry.permit === "none"
        ? entry.permit
        : legacyStatus === "received" ? "has" : null,
      note: typeof entry.note === "string" ? entry.note : "",
    };
    if (entry.datasheet === "has" || entry.datasheet === "none") next.datasheet = entry.datasheet;
    if (entry.required === true) next.required = true;
    if (Array.isArray(entry.files)) next.files = entry.files.filter((f): f is string => typeof f === "string");
    if (entry.fields && typeof entry.fields === "object" && !Array.isArray(entry.fields)) {
      next.fields = Object.fromEntries(
        Object.entries(entry.fields as Record<string, unknown>)
          .filter(([, v]) => typeof v === "string" || typeof v === "number")
          .map(([k, v]) => [k, String(v)]),
      );
    }

    // ชนกันได้ถ้าข้อมูลเก่ามีทั้ง `MEA:individual:id_card` และ `PEA:individual:id_card`
    // เก็บอันที่มีข้อมูลมากกว่าไว้ เพื่อไม่ให้ติ๊กที่เคยทำไว้หาย
    const prev = out[key];
    if (!prev || (!prev.received && next.received) || (!prev.permit && next.permit)) {
      out[key] = { ...prev, ...next };
    }
  }
  return out;
}

export interface GridTieProgress {
  /** ตรวจรับหน้างานแล้วกี่แถว */
  received: number;
  /** ฝ่าย Permit ยืนยันแล้วกี่แถว */
  permit: number;
  total: number;
  /** Permit ยืนยันครบทุกแถว — เป็นข้อมูลแสดงผล ไม่ได้ใช้บล็อกการปิดงาน */
  complete: boolean;
}

export function getGridTieProgress(
  applicantType: string,
  checklistValue: string | null | undefined,
): GridTieProgress {
  const checklist = parseGridTieChecklist(checklistValue);
  const items = getGridTieChecklistItems(applicantType)
    .filter(item => !item.conditional || checklist[item.id]?.required === true);
  const received = items.filter(item => checklist[item.id]?.received === true).length;
  const permit = items.filter(item => checklist[item.id]?.permit === "has").length;
  return {
    received,
    permit,
    total: items.length,
    complete: items.length > 0 && permit === items.length,
  };
}

// ── เกณฑ์ปิดงาน ─────────────────────────────────────────────────────────────

export interface GridTieFinalData {
  grid_utility?: string | null;
  grid_app_no?: string | null;
  grid_applicant_type?: string | null;
  grid_document_checklist?: string | null;
  grid_application_doc_url?: string | null;
  grid_permit_doc_url?: string | null;
}

/**
 * เกณฑ์ปิดงาน — **ไม่บังคับ checklist**
 * checklist เป็นเครื่องมือติดตามงานเฉย ๆ คนกรอกตัดสินเองว่าแถวไหนเกี่ยวกับงานนี้
 * ถ้าบังคับให้ครบทุกแถวจะปิดงานไม่ได้เลย เพราะใบ กว. (MEA) กับ ใบ กส. (PEA)
 * ใช้ได้ทีละอัน สิ่งที่บังคับคือหลักฐานปลายทางที่ต้องมีจริงทุกงาน
 */
export function getGridTieFinalMissing(data: GridTieFinalData): string[] {
  const missing: string[] = [];
  if (!data.grid_utility) missing.push("การไฟฟ้า");
  if (!data.grid_app_no) missing.push("เลขที่คำขอ");
  if (!data.grid_application_doc_url) missing.push("เอกสารยื่นขอขนานไฟ");
  if (!data.grid_permit_doc_url) missing.push("ใบอนุญาต/PPA");
  return missing;
}
