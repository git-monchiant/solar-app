// ── ชุดยื่นคำขอขนานไฟ ───────────────────────────────────────────────────────
// โครงสร้างตามฟอร์มกระดาษของทีม Permit (`File Permit : Up 20082026`)
// แผน: docs/plan/20260831-01-gridtie-permit-checklist-redesign.md
//
// แถวที่ฟอร์มระบุว่าใช้เฉพาะการไฟฟ้าเจ้าเดียว จะไม่แสดงเลยเมื่อเลือกอีกเจ้า
// (ข้อมูลที่เคยติ๊กไว้ยังอยู่ใน JSON แค่ไม่ถูกแสดงและไม่ถูกนับ สลับกลับมาก็เห็นเหมือนเดิม)
// ไม่ผูกกับเจตนาขายไฟ — ฟอร์มเขียนว่า MEA-ขายไฟ แต่ตัดสินให้ดูแค่ MEA พอ (2 ก.ย. 2026)
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
  /** ช่องที่กรอกเลขยาว — ขยายความกว้างในฟอร์ม */
  wide?: boolean;
  /** ตัวอย่างค่า ช่วยให้รู้ว่าต้องกรอกอะไรลงไป */
  placeholder?: string;
}

export interface GridTieChecklistItem {
  id: string;
  label: string;
  detail?: string;
  owner: GridTieOwner;
  section: "doc" | "equipment";
  /** ฟอร์มระบุว่าใช้กับการไฟฟ้าเจ้าเดียว — เจ้าอื่นจะจางและไม่ถูกนับ */
  cond?: "MEA" | "PEA";
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

/**
 * เจตนาของงาน — ใช้เป็นตัวเลือกของช่อง `intent` ในแถว "หนังสือแสดงเจตนา"
 * เก็บไว้ใน checklist JSON ที่เดียว ไม่มีคอลัมน์แยก (ตัดสินใจ 2 ก.ย. 2026)
 */
export const GRID_TIE_MODES = [
  { value: "parallel", label: "ขนานไฟ" },
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

// ฟอร์มกระดาษเขียน "มี/ไม่มี" ไว้ท้ายบางช่อง — ทำเป็นตัวเลือกแทนให้กรอกง่าย
const HAS_OPTIONS = [
  { value: "has", label: "มี" },
  { value: "none", label: "ไม่มี" },
] as const;

const PHASE_OPTIONS = [
  { value: "1", label: "1 เฟส" },
  { value: "3", label: "3 เฟส" },
] as const;

// ── เอกสารฝั่งหน้างาน — เหมือนกันทั้งบุคคลธรรมดาและนิติบุคคล ─────────────────

const SITE_DOCS: readonly GridTieChecklistItem[] = [
  {
    id: "site_coordinates", section: "doc", owner: "install",
    label: "พิกัดระบุสถานที่ตั้ง ลองจิจูด ละติจูด / Google Map",
    fields: [
      { key: "lat", label: "ละติจูด", placeholder: "13.7563" },
      { key: "lng", label: "ลองจิจูด", placeholder: "100.5018" },
      { key: "map_url", label: "ลิงก์ Google Map", wide: true, placeholder: "วางลิงก์" },
    ],
  },
  {
    id: "site_photo_timestamp", section: "doc", owner: "install",
    label: "รูปถ่ายติดตั้งหน้างาน (มี Time stamp ระบุวันที่ + สถานที่ติดตั้ง)",
  },
  {
    id: "single_line_diagram", section: "doc", owner: "install",
    label: "แบบผังวงจรไฟฟ้า Single Line + ลงนามวิศวกรไฟฟ้า",
  },
  {
    id: "engineer_cert", section: "doc", owner: "install", cond: "MEA",
    label: "หนังสือรับรองไฟฟ้า + ใบ กว. (เฉพาะ MEA)",
  },
  {
    // เดิมตั้ง id ว่า architect_cert เพราะถอดความจากรูปเบลอผิดเป็น "สถาปนิก + ใบ กส."
    // ที่จริงเป็นหนังสือสภาวิศวกร + ใบ กว. เหมือนกัน ต่างกันแค่ใช้กับ PEA
    id: "council_engineer_cert", section: "doc", owner: "install", cond: "PEA",
    label: "หนังสือสภาวิศวกร + ใบ กว. (เฉพาะ PEA)",
  },
  {
    id: "boq_quotation", section: "doc", owner: "install",
    label: "ใบเสนอราคา / BOQ (ฝ่ายบัญชี)", autofill: "ใบเสนอราคาที่อนุมัติ",
  },
];


// ── ชุดบุคคลธรรมดา — ยกจากฟอร์มกระดาษ 14 แถว ────────────────────────────────

// id หลายตัวจงใจใช้ของเดิมที่แอปเคยใช้ (latest_electricity_bill, tax_measure_consent,
// power_of_attorney, post_solar_house_registration) เพราะเป็นเอกสารใบเดียวกัน
// ทำให้ติ๊กของ Lead เก่าที่ parseGridTieChecklist() แปลงมา จับคู่ได้ทันที — ห้ามเปลี่ยน
const INDIVIDUAL_DOCS: readonly GridTieChecklistItem[] = [
  {
    id: "latest_electricity_bill", section: "doc", owner: "sale",
    label: "สำเนาใบแจ้งค่าไฟ (ชื่อเดียวกับผู้ใช้ไฟตามมิเตอร์)",
    autofill: "รูปบิลจาก Pre-Survey",
    fields: [
      // สองช่องแรกอยู่ใต้ชื่อเอกสารในฟอร์มกระดาษ ที่เหลืออยู่คอลัมน์หมายเหตุ
      { key: "ca_no", label: "เลขผู้ใช้ไฟฟ้า / บัญชีแสดงสัญญา", wide: true, placeholder: "เช่น 0201234567890" },
      { key: "meter_code", label: "เลขรหัสเครื่องวัด", wide: true, placeholder: "เช่น 12345678" },
      { key: "customer_type", label: "ประเภทผู้ใช้ไฟ", placeholder: "เช่น 1.1" },
      { key: "meter_size", label: "ขนาดเครื่องวัด", options: METER_SIZE_OPTIONS },
      { key: "voltage", label: "แรงดัน", suffix: "V", placeholder: "เช่น 230" },
      { key: "phase", label: "จำนวนเฟส", options: PHASE_OPTIONS },
      { key: "wire", label: "จำนวนสาย", suffix: "สาย", placeholder: "เช่น 2" },
    ],
  },
  {
    id: "tax_measure_consent", section: "doc", owner: "sale", cond: "MEA",
    label: "หนังสือยินยอมการเข้าร่วมโครงการภาษี (เฉพาะ MEA)",
    fields: [{ key: "online_ref_no", label: "เลขรับเรื่องออนไลน์", wide: true, placeholder: "เลขที่ได้จากระบบ MEA" }],
  },
  {
    id: "bank_account_notice", section: "doc", owner: "sale", cond: "MEA",
    label: "หนังสือแจ้งข้อมูลบัญชีธนาคาร (เฉพาะ MEA-ขายไฟ)",
    fields: [{ key: "issued_date", label: "ลงวันที่", wide: true, placeholder: "เช่น 01/09/2569" }],
  },
  {
    id: "bank_book_copy", section: "doc", owner: "sale", cond: "MEA",
    label: "สำเนาบัญชีธนาคารโอนค่าขายไฟ (เฉพาะ MEA-ขายไฟ)",
    fields: [{ key: "gridtie_fee_paid", label: "ชำระเงินค่าขนานไฟ", wide: true, placeholder: "เช่น 2,140 บาท" }],
  },
  {
    id: "power_of_attorney", section: "doc", owner: "sale",
    label: "หนังสือมอบอำนาจ (ขายไฟ/ขนานไฟ/ภาษี)",
    // ป้ายเป็นคำถาม ไม่ซ้ำกับตัวเลือกที่อยู่ในดรอปดาวน์อยู่แล้ว
    fields: [{ key: "intent", label: "มอบอำนาจเพื่อ", options: GRID_TIE_MODES }],
  },
  {
    id: "id_card", section: "doc", owner: "sale",
    label: "สำเนาบัตรประชาชน (ชื่อผู้มอบ / ผู้รับมอบ)",
  },
  {
    id: "house_registration", section: "doc", owner: "sale",
    label: "สำเนาทะเบียนบ้าน (ชื่อผู้มอบ / ผู้รับมอบ)",
  },
  {
    id: "post_solar_house_registration", section: "doc", owner: "sale",
    label: "สำเนาทะเบียนบ้าน (บ้านติดตั้ง Solar)",
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
    id: "tax_measure_consent", section: "doc", owner: "sale", cond: "MEA",
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
      { key: "brand", label: "ยี่ห้อ", placeholder: "ระบุ" },
      { key: "model", label: "รุ่น", wide: true, placeholder: "ระบุ" },
      { key: "watt", label: "ขนาดต่อแผง", suffix: "วัตต์", placeholder: "640" },
      { key: "count", label: "จำนวนแผง", suffix: "แผง", placeholder: "16" },
      { key: "nameplate_photo", label: "รูปถ่ายเนมเพลทใต้แผง (ถ้ามี)", options: HAS_OPTIONS },
    ],
  },
  {
    id: "inverter", section: "equipment", owner: "install", datasheet: true,
    label: "Inverter", autofill: "ใบตรวจติดตั้ง",
    fields: [
      { key: "brand", label: "ยี่ห้อ", placeholder: "ระบุ" },
      { key: "model", label: "รุ่น", wide: true, placeholder: "ระบุ" },
      { key: "kw", label: "ขนาดต่อตัว", suffix: "กิโลวัตต์", placeholder: "10" },
      { key: "count", label: "จำนวน", suffix: "ตัว", placeholder: "1" },
      { key: "sn_photo", label: "รูปถ่ายเลขซีเรียล S/N", options: HAS_OPTIONS },
    ],
  },
  {
    id: "zero_export", section: "equipment", owner: "install", datasheet: true,
    label: "อุปกรณ์ Zero Export / กันไฟย้อน / จุดเชื่อมต่อ",
    fields: [
      { key: "brand", label: "ยี่ห้อ", placeholder: "ระบุ" },
      { key: "model", label: "รุ่น", wide: true, placeholder: "ระบุ" },
    ],
  },
  {
    id: "ct", section: "equipment", owner: "install", datasheet: true,
    label: "อุปกรณ์ Current Transformer : CT",
    fields: [
      { key: "brand", label: "ยี่ห้อ", placeholder: "ระบุ" },
      { key: "model", label: "รุ่น", wide: true, placeholder: "ระบุ" },
      { key: "rating_a", label: "พิกัด", suffix: "A", placeholder: "100" },
      { key: "rating_ma", label: "พิกัด", suffix: "mA", placeholder: "50" },
      { key: "class", label: "Class", placeholder: "0.5" },
      { key: "iec", label: "มาตรฐาน IEC", options: HAS_OPTIONS },
    ],
  },
  {
    id: "battery", section: "equipment", owner: "install", datasheet: true,
    label: "แบตเตอรี่ Battery Energy Storage System", autofill: "ใบตรวจติดตั้ง",
    fields: [
      { key: "brand", label: "ยี่ห้อ", placeholder: "ระบุ" },
      { key: "model", label: "รุ่น", wide: true, placeholder: "ระบุ" },
      { key: "count", label: "จำนวน", suffix: "ตัว", placeholder: "2" },
      // ฟอร์มเขียนหน่วยนี้ว่า mA ซึ่งน่าจะพิมพ์ตก (ความจุแบตปกติเป็น Ah)
      // ทำตามฟอร์มไว้ก่อน รอผู้ใช้ยืนยัน
      { key: "capacity_ma", label: "Capacity", suffix: "mA" },
      { key: "capacity_kwh", label: "Capacity ต่อตัว", suffix: "kWh", placeholder: "4.8" },
      { key: "capacity_kw", label: "Capacity", suffix: "kW" },
    ],
  },
];


// ── การเลือกรายการ ──────────────────────────────────────────────────────────

/** แถวนี้ใช้กับการไฟฟ้าที่เลือกไว้ไหม — ยังไม่เลือกถือว่าใช้ได้ทุกแถว */
export function matchesGridTieUtility(item: GridTieChecklistItem, utility: string): boolean {
  return !item.cond || !utility || item.cond === utility;
}

/**
 * รายการที่ต้องแสดงของงานนี้
 *   บุคคลธรรมดา — 14 แถวตามฟอร์มกระดาษ + อุปกรณ์ 5 กลุ่ม
 *   นิติบุคคล   — รายการเดิมของแอป เอกสารฝั่งลูกค้าล้วน ไม่มีส่วนอุปกรณ์
 * แล้วตัดแถวที่เป็นของการไฟฟ้าอีกเจ้าออก
 */
export function getGridTieChecklistItems(applicantType: string, utility = ""): GridTieChecklistItem[] {
  if (!applicantType) return [];
  const all = applicantType === "juristic" ? JURISTIC_DOCS : [...INDIVIDUAL_DOCS, ...EQUIPMENT];
  return all.filter(item => matchesGridTieUtility(item, utility));
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
  utility: string,
  checklistValue: string | null | undefined,
): GridTieProgress {
  const checklist = parseGridTieChecklist(checklistValue);
  const items = getGridTieChecklistItems(applicantType, utility)
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
