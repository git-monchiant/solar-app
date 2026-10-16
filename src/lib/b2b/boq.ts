import type { AppRole } from "@/lib/role-permissions";
import type { AddonMode } from "./boq-calc";
import { parseOmParams, type OmParams, type OmRole } from "./boq-om";
import type { PriceBasis } from "./materials";

// ใบ BOQ — ชนิด / สิทธิ์ / ตัวตรวจ body ที่หน้าจอกับ API ใช้ร่วมกัน (ไม่มี mssql ⇒ client import ได้)
// แผน docs/plan/20261005-01-b2b-boq-module.md เฟส 3

/** ทำ BOQ = Solar B2B + admin · Purchase ไม่เห็นหน้า BOQ (เคาะ 6 ต.ค. 69) */
export const B2B_BOQ_ROLES = ["b2b", "admin"] as const satisfies readonly AppRole[];
/** เปิดดู/ดาวน์โหลด Excel = + ผู้ตรวจสอบใบเสนอราคา 3 ชั้น (แผน 20261015-07 เฟส 2) */
export const B2B_BOQ_VIEW_ROLES = ["b2b", "b2b_review1", "b2b_review2", "b2b_review3", "admin"] as const satisfies readonly AppRole[];

/** หมวดเสริม (Optional Add-on) — ใส่ราคาเองได้เฉพาะหมวดเหล่านี้ (เคาะ 6 ต.ค. 69 ตัวเลือก ข.) */
export const ADDON_MIN_CATEGORY = 19;
/** ใส่ราคาเองได้ 2 แบบ: ต่อหน่วย / ต่อ Wp ของระบบ (เช่น ค่าแรงรื้อถอนระบบเดิม บาท/Wp) */
export const MANUAL_PRICE_BASIS: PriceBasis[] = ["unit", "system_wp"];

/** รุ่นแผงส่วนใหญ่มีวัตต์ในชื่ออยู่แล้ว ("Jinko Solar 720W") — ต่อท้าย "· 720 W" เฉพาะรุ่นที่ไม่มี (แบบหน้าวัสดุและราคา) */
export const wattInModel = (model: string | null, watt: number | null) =>
  watt != null && (model ?? "").replace(/\s/g, "").toLowerCase().includes(`${watt}w`);

export type BoqHeader = {
  id: number;
  doc_no: string;
  revision: number;
  is_latest: boolean;
  /** โครงการที่ใบนี้อยู่ (แผน 20261015-07) — มีแล้ว ชื่อโครงการ/ลูกค้า/ที่ตั้งมาจากโครงการ แก้ในหน้าโครงการ */
  project_id: number | null;
  project_code: string | null;
  /** ชื่อตัวเลือกในโครงการ เช่น "998.64 kWp · Jinko 730" */
  option_label: string | null;
  /** ใบเสนอราคาที่ส่งอนุมัติแล้วอ้าง Rev นี้ ("SSE-… Rev 0") — แก้ไม่ได้ ต้องออก Revision ใหม่ */
  locked_by_quote: string | null;
  /** ขั้นของโครงการ — ผ่านราคายืนยันแล้ว (ได้งาน/ปิด/แพ้/ยกเลิก) BOQ แก้/ออก Rev ไม่ได้ (boqStageLocked) */
  project_stage: number | null;
  project_name: string;
  customer_name: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  margin_pct: number;
  vat_pct: number;
  addon_modes: Record<number, AddonMode>;
  /** ช่องตั้งค่า O&M หมวด 13 (แผน 20261016-03) — null = ยังไม่ใช้สูตร */
  om_params: OmParams | null;
  note: string | null;
  capacity_wp: number | null;
  total_cost: number | null;
  total_sale: number | null;
  pending_lines: number;
  created_at: string;
  created_by_name: string | null;
  updated_at: string;
  updated_by_name: string | null;
};

/** BOQ ของโครงการแก้/ออก Revision ได้เฉพาะตอนโครงการยังอยู่ขั้นขาย (โครงการใหม่ → ราคายืนยัน) — กติกาเดียวกับ canEditBoq ของหน้าโครงการ
 *  ได้งานแล้ว BOQ ที่ได้งาน = งบโครงการ (Purchase/บัญชีอ้าง) · แพ้/ยกเลิก ให้เปิดโครงการกลับก่อน (ทบทวน BOQ 15 ต.ค.) */
export const BOQ_EDITABLE_MAX_STAGE = 3400;
export const boqStageLocked = (projectStage: number | null | undefined) => projectStage != null && projectStage > BOQ_EDITABLE_MAX_STAGE;

export type BoqLine = {
  id?: number;
  /** key ฝั่งหน้าจอ (บรรทัดใหม่ยังไม่มี id) */
  key: string;
  category_id: number;
  line_type: "material" | "manual";
  material_id: number | null;
  subgroup: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  unit: string;
  spec_watt: number | null;
  price_basis: PriceBasis;
  unit_cost: number | null;
  qty: number;
  note: string | null;
  price_entered_by_name?: string | null;
  /** ราคาปัจจุบันใน Master — ต่างจาก unit_cost = ป้าย "ราคาเปลี่ยน" */
  current_unit_price?: number | null;
  current_active?: boolean;
  /** บรรทัดสูตร O&M (Master ติด om_role) — จำนวนคิดจากช่องตั้งค่าของใบ แก้มือไม่ได้ */
  om_role?: OmRole | null;
  /** ส่งไปตอนบันทึก = ขอดึงข้อมูล/ราคาล่าสุดจาก Master */
  refresh_price?: boolean;
};

export type BoqRevision = { id: number; revision: number; is_latest: boolean; updated_at: string };

export function parseAddonModes(raw: unknown): Record<number, AddonMode> {
  let obj: unknown = raw;
  if (typeof raw === "string") { try { obj = JSON.parse(raw); } catch { obj = null; } }
  const out: Record<number, AddonMode> = {};
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const id = Number(k);
      if (Number.isInteger(id) && id >= ADDON_MIN_CATEGORY && id <= 25 && (v === "included" || v === "optional")) out[id] = v;
    }
  }
  return out;
}

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const numOrNull = (v: unknown) => (v === "" || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : NaN);

export type HeaderFields = {
  option_label: string | null;
  project_name: string; customer_name: string | null; location: string | null;
  latitude: number | null; longitude: number | null; margin_pct: number; note: string | null;
  addon_modes: Record<number, AddonMode>;
  om_params: OmParams | null;
};

/** ตรวจหัวใบ (POST สร้าง / PUT บันทึก)
 *  Margin ว่าง: สร้างใบ = ค่าเริ่มต้น 15% · บันทึก = ต้องระบุ (เดิมกลายเป็น 15% เงียบๆ ขณะหน้าจอคิด 0% — ทบทวน BOQ 15 ต.ค.)
 *  ตรวจหลังปัด 3 ตำแหน่ง (99.9996 → 100 ทำ Excel หารศูนย์) */
export function readBoqHeader(b: Record<string, unknown>, opts: { create?: boolean } = {}): { value: HeaderFields } | { error: string } {
  const project_name = text(b.project_name, 300);
  if (!project_name) return { error: "กรุณาระบุชื่อโครงการ" };
  const empty = b.margin_pct == null || b.margin_pct === "";
  if (empty && !opts.create) return { error: "กรุณาระบุ Margin" };
  const margin = empty ? 15 : Math.round(Number(b.margin_pct) * 1000) / 1000;
  if (!Number.isFinite(margin) || margin < 0 || margin >= 100) return { error: "Margin ต้องอยู่ระหว่าง 0 ถึงน้อยกว่า 100%" };
  const lat = numOrNull(b.latitude); const lng = numOrNull(b.longitude);
  if (Number.isNaN(lat) || (lat != null && Math.abs(lat) > 90)) return { error: "Latitude ไม่ถูกต้อง" };
  if (Number.isNaN(lng) || (lng != null && Math.abs(lng) > 180)) return { error: "Longitude ไม่ถูกต้อง" };
  const om = parseOmParams(b.om_params);
  if ("error" in om) return { error: om.error };
  return {
    value: {
      option_label: text(b.option_label, 100),
      project_name, customer_name: text(b.customer_name, 300), location: text(b.location, 500),
      latitude: lat, longitude: lng, margin_pct: margin, note: text(b.note, 1000),
      addon_modes: parseAddonModes(b.addon_modes), om_params: om.value,
    },
  };
}

/** เพดานตัวเลข — กันพิมพ์เลขเกินช่อง DECIMAL ของตาราง (เดิมได้ 500) · แผน 20261016-02 ข้อ 4 */
export const BOQ_MAX_QTY = 1_000_000;
export const BOQ_MAX_MANUAL_COST = 100_000_000;
/** ยอดรวมทั้งใบ (ต้นทุน/ขาย ก่อน VAT) — ช่อง total_* เป็น DECIMAL(16,2) · Margin สูงๆ คูณยอดขายได้หลายเท่า */
export const BOQ_MAX_TOTAL = 1_000_000_000_000;
/** หมายเหตุรายบรรทัด (b2b_boq_items.note NVARCHAR(500)) */
export const BOQ_LINE_NOTE_MAX = 500;

export type IncomingLine = { id: number | null; category_id: number; qty: number; note: string | null; label: string } & (
  | { kind: "material"; material_id: number; refresh: boolean }
  | { kind: "manual"; name: string; brand: string | null; model: string | null; unit: string; price_basis: PriceBasis; unit_cost: number }
);

/** ตรวจโครงบรรทัดที่ส่งมาบันทึก — ราคาของบรรทัด Master ไม่รับจากหน้าจอ (server เติมจาก Master เอง)
 *  ข้อความผิดพลาดบอก "หมวด X ลำดับ N" = เลข # ในตารางหมวดนั้นบนจอ (หน้าจอส่งบรรทัดตามลำดับที่แสดงในแต่ละหมวด) */
export function readBoqLines(raw: unknown): { value: IncomingLine[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "รูปแบบรายการไม่ถูกต้อง" };
  if (raw.length > 2000) return { error: "รายการเกิน 2,000 บรรทัด" };
  const out: IncomingLine[] = [];
  const seen = new Map<number, number>();
  for (const [i, l] of (raw as Record<string, unknown>[]).entries()) {
    const category_id = Number(l?.category_id);
    if (!Number.isInteger(category_id) || category_id < 1 || category_id > 25) return { error: `บรรทัดที่ ${i + 1}: หมวดไม่ถูกต้อง` };
    const pos = (seen.get(category_id) ?? 0) + 1;
    seen.set(category_id, pos);
    const label = `หมวด ${category_id} ลำดับ ${pos}`;
    const qty = Number(l.qty);
    if (!Number.isFinite(qty) || qty < 0) return { error: `${label}: จำนวนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป` };
    if (qty > BOQ_MAX_QTY) return { error: `${label}: จำนวนเกิน ${BOQ_MAX_QTY.toLocaleString("en-US")}` };
    const id = Number.isInteger(Number(l.id)) && Number(l.id) > 0 ? Number(l.id) : null;
    const note = text(l.note, BOQ_LINE_NOTE_MAX);
    if (l.line_type === "material") {
      const material_id = Number(l.material_id);
      if (!Number.isInteger(material_id) || material_id <= 0) return { error: `${label}: ไม่ได้เลือกรายการจาก Master` };
      out.push({ kind: "material", id, category_id, material_id, qty, refresh: l.refresh_price === true, note, label });
    } else if (l.line_type === "manual") {
      if (category_id < ADDON_MIN_CATEGORY) return { error: `${label}: หมวด ${category_id} ต้องเลือกจาก Master — ใส่ราคาเองได้เฉพาะหมวดเสริม 19–25` };
      const name = text(l.name, 300); const unit = text(l.unit, 30);
      if (!name) return { error: `${label}: กรุณาระบุชื่อรายการ` };
      if (!unit) return { error: `${label}: กรุณาระบุหน่วย` };
      const unit_cost = Number(l.unit_cost);
      if (l.unit_cost === "" || l.unit_cost == null || !Number.isFinite(unit_cost) || unit_cost < 0) return { error: `${label}: กรุณาใส่ราคาต่อหน่วย` };
      if (unit_cost > BOQ_MAX_MANUAL_COST) return { error: `${label}: ราคาต่อหน่วยเกิน ${BOQ_MAX_MANUAL_COST.toLocaleString("en-US")} บาท` };
      const price_basis = MANUAL_PRICE_BASIS.includes(l.price_basis as PriceBasis) ? (l.price_basis as PriceBasis) : "unit";
      out.push({ kind: "manual", id, category_id, name, brand: text(l.brand, 150), model: text(l.model, 300), unit, price_basis, unit_cost, qty, note, label });
    } else {
      return { error: `${label}: ชนิดบรรทัดไม่ถูกต้อง` };
    }
  }
  return { value: out };
}
