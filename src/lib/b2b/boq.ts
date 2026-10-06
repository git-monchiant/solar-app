import type { AppRole } from "@/lib/role-permissions";
import type { AddonMode } from "./boq-calc";
import type { PriceBasis } from "./materials";

// ใบ BOQ — ชนิด / สิทธิ์ / ตัวตรวจ body ที่หน้าจอกับ API ใช้ร่วมกัน (ไม่มี mssql ⇒ client import ได้)
// แผน docs/plan/20261005-01-b2b-boq-module.md เฟส 3

/** ทำ BOQ = Solar B2B + admin · Purchase ไม่เห็นหน้า BOQ (เคาะ 6 ต.ค. 69) */
export const B2B_BOQ_ROLES = ["b2b", "admin"] as const satisfies readonly AppRole[];

/** หมวดเสริม (Optional Add-on) — ใส่ราคาเองได้เฉพาะหมวดเหล่านี้ (เคาะ 6 ต.ค. 69 ตัวเลือก ข.) */
export const ADDON_MIN_CATEGORY = 19;
/** ใส่ราคาเองได้ 2 แบบ: ต่อหน่วย / ต่อ Wp ของระบบ (เช่น ค่าแรงรื้อถอนระบบเดิม บาท/Wp) */
export const MANUAL_PRICE_BASIS: PriceBasis[] = ["unit", "system_wp"];

export type BoqHeader = {
  id: number;
  doc_no: string;
  revision: number;
  is_latest: boolean;
  project_name: string;
  customer_name: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  margin_pct: number;
  vat_pct: number;
  addon_modes: Record<number, AddonMode>;
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
  project_name: string; customer_name: string | null; location: string | null;
  latitude: number | null; longitude: number | null; margin_pct: number; note: string | null;
  addon_modes: Record<number, AddonMode>;
};

/** ตรวจหัวใบ (POST สร้าง / PUT บันทึก) */
export function readBoqHeader(b: Record<string, unknown>): { value: HeaderFields } | { error: string } {
  const project_name = text(b.project_name, 300);
  if (!project_name) return { error: "กรุณาระบุชื่อโครงการ" };
  const margin = b.margin_pct == null || b.margin_pct === "" ? 15 : Number(b.margin_pct);
  if (!Number.isFinite(margin) || margin < 0 || margin >= 100) return { error: "Margin ต้องอยู่ระหว่าง 0 ถึงน้อยกว่า 100%" };
  const lat = numOrNull(b.latitude); const lng = numOrNull(b.longitude);
  if (Number.isNaN(lat) || (lat != null && Math.abs(lat) > 90)) return { error: "Latitude ไม่ถูกต้อง" };
  if (Number.isNaN(lng) || (lng != null && Math.abs(lng) > 180)) return { error: "Longitude ไม่ถูกต้อง" };
  return {
    value: {
      project_name, customer_name: text(b.customer_name, 300), location: text(b.location, 500),
      latitude: lat, longitude: lng, margin_pct: Math.round(margin * 1000) / 1000, note: text(b.note, 1000),
      addon_modes: parseAddonModes(b.addon_modes),
    },
  };
}

export type IncomingLine =
  | { kind: "material"; id: number | null; category_id: number; material_id: number; qty: number; refresh: boolean; note: string | null }
  | { kind: "manual"; id: number | null; category_id: number; name: string; brand: string | null; model: string | null; unit: string;
      price_basis: PriceBasis; unit_cost: number; qty: number; note: string | null };

/** ตรวจโครงบรรทัดที่ส่งมาบันทึก — ราคาของบรรทัด Master ไม่รับจากหน้าจอ (server เติมจาก Master เอง) */
export function readBoqLines(raw: unknown): { value: IncomingLine[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "รูปแบบรายการไม่ถูกต้อง" };
  if (raw.length > 2000) return { error: "รายการเกิน 2,000 บรรทัด" };
  const out: IncomingLine[] = [];
  for (const [i, l] of (raw as Record<string, unknown>[]).entries()) {
    const n = i + 1;
    const category_id = Number(l?.category_id);
    if (!Number.isInteger(category_id) || category_id < 1 || category_id > 25) return { error: `บรรทัดที่ ${n}: หมวดไม่ถูกต้อง` };
    const qty = Number(l.qty);
    if (!Number.isFinite(qty) || qty < 0) return { error: `บรรทัดที่ ${n}: จำนวนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป` };
    const id = Number.isInteger(Number(l.id)) && Number(l.id) > 0 ? Number(l.id) : null;
    const note = text(l.note, 500);
    if (l.line_type === "material") {
      const material_id = Number(l.material_id);
      if (!Number.isInteger(material_id) || material_id <= 0) return { error: `บรรทัดที่ ${n}: ไม่ได้เลือกรายการจาก Master` };
      out.push({ kind: "material", id, category_id, material_id, qty, refresh: l.refresh_price === true, note });
    } else if (l.line_type === "manual") {
      if (category_id < ADDON_MIN_CATEGORY) return { error: `บรรทัดที่ ${n}: หมวด ${category_id} ต้องเลือกจาก Master — ใส่ราคาเองได้เฉพาะหมวดเสริม 19–25` };
      const name = text(l.name, 300); const unit = text(l.unit, 30);
      if (!name) return { error: `บรรทัดที่ ${n}: กรุณาระบุชื่อรายการ` };
      if (!unit) return { error: `บรรทัดที่ ${n}: กรุณาระบุหน่วย` };
      const unit_cost = Number(l.unit_cost);
      if (l.unit_cost === "" || l.unit_cost == null || !Number.isFinite(unit_cost) || unit_cost < 0) return { error: `บรรทัดที่ ${n}: กรุณาใส่ราคาต่อหน่วย` };
      const price_basis = MANUAL_PRICE_BASIS.includes(l.price_basis as PriceBasis) ? (l.price_basis as PriceBasis) : "unit";
      out.push({ kind: "manual", id, category_id, name, brand: text(l.brand, 150), model: text(l.model, 300), unit, price_basis, unit_cost, qty, note });
    } else {
      return { error: `บรรทัดที่ ${n}: ชนิดบรรทัดไม่ถูกต้อง` };
    }
  }
  return { value: out };
}
