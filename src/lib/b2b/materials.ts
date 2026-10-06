import type { AppRole } from "@/lib/role-permissions";

// Master Data วัสดุของโมดูล BOQ — ชนิด / สิทธิ์ / ตัวตรวจ body ที่หน้าจอกับ API ใช้ร่วมกัน
// ไม่มี mssql ⇒ client import ได้ · แผน docs/plan/20261005-01-b2b-boq-module.md (เฟส 2)

// ★ สิทธิ์แยก 2 ฝั่ง (ผู้ใช้เคาะ 6 ต.ค. 69): ข้อมูลรายการ = Solar B2B · ราคา = Purchase
//   API แยก endpoint ตามนี้ — Solar B2B ยิงแก้ราคาเองก็ไม่ผ่าน ไม่ได้พึ่งการซ่อนช่องในหน้าจอ
export const B2B_MATERIAL_VIEW_ROLES = ["b2b", "purchase", "admin"] as const satisfies readonly AppRole[];
export const B2B_MATERIAL_EDIT_ROLES = ["b2b", "admin"] as const satisfies readonly AppRole[];
export const B2B_PRICE_EDIT_ROLES = ["purchase", "admin"] as const satisfies readonly AppRole[];

/** badge "รอราคา" ของการ์ด BOQ — แถวสมมติใน /api/journey-summary ({journey_sub: 9010})
 *  ให้ countForMenuItem/countForModule นับได้เลยโดยไม่แก้โค้ดนับ (วิธีเดียวกับ O&M สาย 2000) */
export const B2B_PENDING_PRICE_SUB = 9010;

export type PriceBasis = "unit" | "watt" | "system_wp" | "pct_category" | "pct_sale";

export const PRICE_BASIS: { key: PriceBasis; label: string; hint: string }[] = [
  { key: "unit", label: "ต่อหน่วย", hint: "ต้นทุน = จำนวน × ราคา" },
  { key: "watt", label: "ต่อวัตต์ของแผง", hint: "ต้นทุน = จำนวนแผง × วัตต์ × ราคา (ไฟล์เดิม 4.5 บาท/W)" },
  { key: "system_wp", label: "ต่อ Wp ของระบบ", hint: "ต้นทุน = ขนาดระบบ (Wp) × ราคา เช่น ค่าแรงติดตั้ง" },
  { key: "pct_category", label: "% ของต้นทุนหมวด", hint: "ต้นทุน = % × ต้นทุนบรรทัดอื่นในหมวด เช่น Accessories" },
  { key: "pct_sale", label: "% ของยอดขาย", hint: "ต้นทุน = % × ยอดขายหมวด 1–17 เช่น ประกันภัยโครงการ" },
];

export const priceBasisLabel = (b: PriceBasis) => PRICE_BASIS.find((x) => x.key === b)?.label ?? b;

/** หน่วยของตัวเลขราคา — "บาท/ม้วน" · "บาท/W" · "%" */
export function priceSuffix(basis: PriceBasis, unit: string): string {
  if (basis === "watt") return "บาท/W";
  if (basis === "system_wp") return "บาท/Wp";
  if (basis === "pct_category" || basis === "pct_sale") return "%";
  return `บาท/${unit || "หน่วย"}`;
}

const fmtPrice = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 4 });
export const formatPrice = (n: number | null | undefined) => (n == null ? "รอราคา" : fmtPrice.format(n));

export type B2bCategory = { id: number; name: string; is_addon: boolean };

export type B2bMaterial = {
  id: number;
  code: string;
  category_id: number;
  subgroup: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  spec_watt: number | null;
  unit: string;
  price_basis: PriceBasis;
  unit_price: number | null;
  warranty: string | null;
  note: string | null;
  sort_order: number;
  is_active: boolean;
  price_updated_at: string | null;
  price_updated_by_name: string | null;
};

export type B2bPriceHistory = {
  id: number;
  old_price: number | null;
  new_price: number | null;
  note: string | null;
  changed_at: string;
  changed_by_name: string | null;
};

/** ช่องที่ Solar B2B แก้ได้ — ไม่มีราคา (ราคาไปทาง /prices ของ Purchase เท่านั้น) */
export type MaterialFields = {
  category_id: number;
  subgroup: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  spec_watt: number | null;
  unit: string;
  price_basis: PriceBasis;
  warranty: string | null;
  note: string | null;
  sort_order: number;
  is_active: boolean;
};

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** ตรวจ body ของ POST/PATCH ข้อมูลรายการ — ช่องราคาที่ติดมาถูกทิ้งเงียบๆ */
export function readMaterialBody(b: Record<string, unknown>): { value: MaterialFields } | { error: string } {
  const category_id = Number(b.category_id);
  if (!Number.isInteger(category_id) || category_id < 1 || category_id > 25) return { error: "กรุณาเลือกหมวด" };
  const name = text(b.name, 300);
  if (!name) return { error: "กรุณาระบุชื่อรายการ" };
  const unit = text(b.unit, 30);
  if (!unit) return { error: "กรุณาระบุหน่วย" };
  const price_basis = PRICE_BASIS.some((x) => x.key === b.price_basis) ? (b.price_basis as PriceBasis) : null;
  if (!price_basis) return { error: "กรุณาเลือกแบบราคา" };
  const watt = b.spec_watt === "" || b.spec_watt == null ? null : Number(b.spec_watt);
  if (price_basis === "watt" && !(watt != null && watt > 0)) return { error: "แบบราคาต่อวัตต์ต้องระบุวัตต์ต่อแผง" };
  const sort = Number(b.sort_order);
  return {
    value: {
      category_id, name, unit, price_basis,
      subgroup: text(b.subgroup, 200),
      brand: text(b.brand, 150),
      model: text(b.model, 300),
      spec_watt: watt != null && Number.isFinite(watt) && watt > 0 ? watt : null,
      warranty: text(b.warranty, 200),
      note: text(b.note, 500),
      sort_order: Number.isInteger(sort) ? sort : 0,
      is_active: b.is_active !== false,
    },
  };
}

/** ตรวจ body ของ PUT /prices — Purchase ใส่ราคาหลายแถวพร้อมกัน + หมายเหตุชุดเดียว */
export function readPriceBody(b: Record<string, unknown>): { value: { items: { id: number; price: number }[]; note: string | null } } | { error: string } {
  if (!Array.isArray(b.items) || b.items.length === 0) return { error: "ไม่มีราคาที่จะบันทึก" };
  if (b.items.length > 500) return { error: "บันทึกได้ครั้งละไม่เกิน 500 รายการ" };
  const items: { id: number; price: number }[] = [];
  for (const raw of b.items as Record<string, unknown>[]) {
    const id = Number(raw?.id);
    const price = Number(raw?.price);
    if (!Number.isInteger(id) || id <= 0) return { error: "รหัสรายการไม่ถูกต้อง" };
    if (raw?.price === "" || raw?.price == null || !Number.isFinite(price) || price < 0) return { error: "ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป" };
    if (price >= 1e10) return { error: "ราคาสูงเกินไป" };
    items.push({ id, price: Math.round(price * 10000) / 10000 });
  }
  return { value: { items, note: text(b.note, 500) } };
}
