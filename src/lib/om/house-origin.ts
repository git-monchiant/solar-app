// "ที่มา" ของบ้าน/ลูกค้า O&M — ตัวกรองหน้างานบริการ · บ้าน / ระบบติดตั้ง · ลูกค้า (แผน 20261007-01)
// ★ นิยามอยู่ที่นี่ที่เดียว — 4 API ใช้ร่วมกัน ตัวเลขบนแท็บกับรายการที่เห็นจะได้ตรงกันทุกหน้า
// ★ ไม่ import อะไร — หน้าจอ (ตัวเลือก dropdown) กับ API (SQL) ใช้ไฟล์เดียวกันได้
//
// "จากงานขาย" = บ้านมีระบบติดตั้งที่ om_installations.lead_id ไม่ว่าง
//   = ตัวกันซ้ำของ sales-sweep.ts (ทั้งกวาดอัตโนมัติ และแอดมินกดรับจากคิวจับคู่)
//   ★ ไม่ใช้ om_houses.lead_id — O&M เขียนช่องนั้นเองตอนออกใบเสนอราคา (lead om_only · om-quotation.ts)
//   ★ ไม่ใช้เลขชุดนำเข้า (source_batch_id) — เป็นเลขของฐาน v3 ตอนนี้ วันย้ายขึ้น prod อาจไม่ตรง
//   บ้านจากทะเบียนที่ภายหลังมีงานขายติดตั้ง (เช่น 311/77) นับเป็นจากงานขาย
// "เพิ่มเอง" = บ้านที่ทีม O&M กด "+ เพิ่มบ้าน" (แผน 20261014-08) — om_houses.project_map_source = MANUAL_HOUSE_SOURCE
//   ★ งานขายชนะ: บ้านที่เพิ่มเองแล้วภายหลังทีมขายติดตั้งให้ นับเป็นจากงานขาย (ลำดับเดียวกับ 311/77)
//   บ้านในทะเบียนที่ "เปิดใช้บ้านเดิม" จากฟอร์มเพิ่มบ้าน ไม่เปลี่ยนที่มา — ยังเป็นทะเบียน

export type HouseOrigin = "" | "sales" | "manual" | "registry";

export const ORIGIN_OPTIONS: { value: HouseOrigin; label: string }[] = [
  { value: "", label: "ทุกที่มา" },
  { value: "sales", label: "B2C" },   // = จากงานขาย · ผู้ใช้เปลี่ยนชื่อ 7 ต.ค. 69
  { value: "manual", label: "เพิ่มเอง" },
  { value: "registry", label: "ทะเบียน / REM / นำเข้า" },
];

/** om_houses.project_map_source ของบ้านที่เพิ่มเองจากหน้าจอ O&M (POST /api/om/houses) */
export const MANUAL_HOUSE_SOURCE = "om_manual";

// ค่าจาก query string → ค่าที่รู้จักเท่านั้น (SQL ด้านล่างประกอบจากค่านี้ ห้ามรับค่าดิบ)
export const parseOrigin = (v: string | null | undefined): HouseOrigin =>
  v === "sales" || v === "manual" || v === "registry" ? v : "";

const fromSales = (houseId: string) =>
  `EXISTS (SELECT 1 FROM om_installations src_i WHERE src_i.house_id = ${houseId} AND src_i.lead_id IS NOT NULL)`;
const addedManually = (houseId: string) =>
  `EXISTS (SELECT 1 FROM om_houses src_h WHERE src_h.id = ${houseId} AND src_h.project_map_source = N'${MANUAL_HOUSE_SOURCE}')`;

/** เงื่อนไขต่อท้าย WHERE ของบ้าน — houseId = SQL expression ของ id บ้าน (เช่น "h.id") · ทุกที่มา = "" */
export function houseOriginSql(o: HouseOrigin, houseId: string): string {
  if (o === "sales") return `AND ${fromSales(houseId)}`;
  if (o === "manual") return `AND NOT ${fromSales(houseId)} AND ${addedManually(houseId)}`;
  if (o === "registry") return `AND NOT ${fromSales(houseId)} AND NOT ${addedManually(houseId)}`;
  return "";
}

/** เงื่อนไขต่อท้าย WHERE ของลูกค้า — นับจากบ้านที่ผูกอยู่ตอนนี้ (is_current = 1)
 *  ผูกหลายบ้านต่างที่มา → งานขาย ชนะ เพิ่มเอง ชนะ ทะเบียน (คนหนึ่งอยู่ที่มาเดียว ตัวเลขรวมได้เท่าทุกที่มา) */
export function customerOriginSql(o: HouseOrigin, customerId: string): string {
  if (!o) return "";
  const linked = (cond: (h: string) => string) => `EXISTS (SELECT 1 FROM om_house_customers src_hc
    WHERE src_hc.customer_id = ${customerId} AND src_hc.is_current = 1 AND ${cond("src_hc.house_id")})`;
  if (o === "sales") return `AND ${linked(fromSales)}`;
  if (o === "manual") return `AND NOT ${linked(fromSales)} AND ${linked(addedManually)}`;
  return `AND NOT ${linked(fromSales)} AND NOT ${linked(addedManually)}`;
}
