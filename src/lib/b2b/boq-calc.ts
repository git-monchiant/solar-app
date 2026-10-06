import type { PriceBasis } from "./materials";

// ตัวคำนวณใบ BOQ — ชุดเดียวที่หน้าจอ / server (ยอดบนหัวใบ) / ไฟล์ Excel (เฟส 4) ใช้ร่วมกัน · ไม่มี I/O
// กติกาตาม sheet "EPCL - BOQS" ของไฟล์ทีม แต่แก้จุดที่ไฟล์พลาด (แผน 20261005-01 ภาคผนวก):
//   · ราคาขาย = ต้นทุน ÷ (1 − margin) สูตรเดียวทุกบรรทัด (ไฟล์ปน × (1 + margin) 76 แถว)
//   · ขนาดระบบ = Σ จำนวนแผง × วัตต์ ทุกบรรทัดแบบ "ต่อวัตต์" (ไฟล์ฝัง 730 และนับแค่แถวแรก)
//   · ยอดสรุปคิดจากบรรทัดจริงทุกหมวด — หมวดเสริมเข้ายอดครบ และ ค่าวัสดุ + ค่าแรง + ส่วนเสริม = ยอดรวมเสมอ
//   · ปัดเป็นสตางค์ที่บรรทัด (ต้นทุนรวม · ราคาขายรวม) และ VAT แล้วค่อยรวม → ยอดทุกระดับบวกกันลงตัวกับที่แสดง
//     (เดิมรวมเลขไม่ปัดแล้วปัดตอนแสดง ยอดรวมคลาดจากผลบวกรายหมวด 1 สตางค์ · 6 ต.ค. 69) — Excel ใช้ ROUND ตำแหน่งเดียวกัน

export type AddonMode = "included" | "optional";

/** ปัดเป็นสตางค์แบบ ROUND(x, 2) ของ Excel — ตัดเศษฐานสองที่ 15 หลักก่อน (1.005 → 1.01 ไม่ใช่ 1.00) */
export function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const [m, e] = Math.abs(n).toPrecision(15).split("e");
  return (Math.sign(n) * Math.round(Number(`${m}e${Number(e ?? 0) + 2}`))) / 100;
}

/** หมวดค่าแรงติดตั้ง — แยกเป็นบรรทัด "ค่าแรง" ในสรุป (ไฟล์: แถว 26 / 38) */
export const LABOR_CATEGORY = 17;
/** ฐานของบรรทัด "% ของยอดขาย" = ยอดขายหมวด 1–17 (ไฟล์: ประกันภัย = % × SUM(K10:K26)) */
export const PCT_SALE_BASE_MAX_CATEGORY = 17;

export type CalcLine = {
  key: string;
  category_id: number;
  price_basis: PriceBasis;
  unit_cost: number | null;   // ต่อหน่วย / บาท·W / บาท·Wp / %
  qty: number;
  spec_watt: number | null;
};

export type CalcCategory = { id: number; is_addon: boolean };

export type LineResult = {
  /** จำนวนที่ใช้คิดจริง — ต่อ Wp ของระบบ = ขนาดระบบ (Wp) */
  eff_qty: number;
  /** ต้นทุนต่อหน่วยที่ใช้คิดจริง (แผง = W × บาท/W · % = % × ฐาน) */
  unit_cost: number;
  cost: number;
  sale_unit: number;
  sale: number;
  /** % ของต้นทุนรวมทั้งใบ (คอลัมน์ R ของไฟล์) */
  share: number;
  pending: boolean;
};

export type Amount = { cost: number; sale: number };

export type CategoryResult = Amount & {
  id: number;
  is_addon: boolean;
  mode: AddonMode | null;     // หมวดเสริมเท่านั้น
  lines: number;
  pending: number;
  share: number;
};

export type CalcResult = {
  capacity_wp: number;
  lines: Record<string, LineResult>;
  categories: Record<number, CategoryResult>;
  /** ค่าวัสดุอุปกรณ์ = หมวดมาตรฐานทุกหมวดยกเว้นค่าแรง (ไฟล์: SUM(I10:I25, I27)) */
  material: Amount;
  /** ค่าแรงติดตั้ง = หมวด 17 */
  labor: Amount;
  /** ส่วนเพิ่มเติมที่รวมในราคา */
  addon_included: Amount;
  /** ส่วนเพิ่มเติมที่เสนอเป็นทางเลือก — ไม่อยู่ในยอดรวม */
  addon_optional: Amount;
  /** ยอดก่อน VAT = ค่าวัสดุ + ค่าแรง + ส่วนเพิ่มเติมที่รวม */
  subtotal: Amount;
  vat: Amount;
  grand: Amount;
  pending_lines: number;
};

const zero = (): Amount => ({ cost: 0, sale: 0 });
// บวกเลขสตางค์ด้วย float ได้เศษ (0.1 + 0.2) — ปัดทุกครั้งที่รวม
const addTo = (a: Amount, b: Amount) => { a.cost = round2(a.cost + b.cost); a.sale = round2(a.sale + b.sale); };

export function calcBoq(input: {
  lines: CalcLine[];
  categories: CalcCategory[];
  margin_pct: number;
  vat_pct: number;
  addon_modes: Record<number, AddonMode>;
}): CalcResult {
  const m = Math.min(Math.max(Number(input.margin_pct) || 0, 0), 99.99) / 100;
  const toSale = (cost: number) => cost / (1 - m);
  const isAddon = new Map(input.categories.map((c) => [c.id, c.is_addon]));
  const qtyOf = (l: CalcLine) => (Number.isFinite(l.qty) ? l.qty : 0);

  const capacity_wp = input.lines
    .filter((l) => l.price_basis === "watt")
    .reduce((s, l) => s + qtyOf(l) * (l.spec_watt ?? 0), 0);

  const res: Record<string, LineResult> = {};
  // ต้นทุนรวม / ราคาขายรวม ปัดเป็นสตางค์ (ราคาขายคิดจากต้นทุนที่ปัดแล้ว = เลขที่เห็น) · ต่อหน่วยไม่ปัด (ค่าแรงบาท/Wp ปัดแล้วคูณจะเพี้ยนหลักร้อย)
  const put = (l: CalcLine, eff_qty: number, unit_cost: number) => {
    const cost = round2(eff_qty * unit_cost);
    res[l.key] = { eff_qty, unit_cost, cost, sale_unit: toSale(unit_cost), sale: round2(toSale(cost)), share: 0, pending: l.unit_cost == null };
  };

  // 1) บรรทัดฐาน — ต่อหน่วย / ต่อวัตต์ / ต่อ Wp ของระบบ
  for (const l of input.lines) {
    const p = l.unit_cost ?? 0;
    if (l.price_basis === "unit") put(l, qtyOf(l), p);
    else if (l.price_basis === "watt") put(l, qtyOf(l), (l.spec_watt ?? 0) * p);
    else if (l.price_basis === "system_wp") put(l, capacity_wp, p);
  }
  // 2) % ของต้นทุนหมวด — ฐาน = ต้นทุนบรรทัดฐานในหมวดเดียวกัน (Accessories)
  const baseCost = new Map<number, number>();
  for (const l of input.lines) if (res[l.key]) baseCost.set(l.category_id, round2((baseCost.get(l.category_id) ?? 0) + res[l.key].cost));
  for (const l of input.lines) {
    if (l.price_basis === "pct_category") put(l, qtyOf(l), ((l.unit_cost ?? 0) / 100) * (baseCost.get(l.category_id) ?? 0));
  }
  // 3) % ของยอดขาย — ฐาน = ยอดขายหมวดมาตรฐาน 1–17 (ประกันภัยโครงการ · จำนวน = ปี)
  let saleBase = 0;
  for (const l of input.lines) {
    if (res[l.key] && l.category_id <= PCT_SALE_BASE_MAX_CATEGORY && !isAddon.get(l.category_id)) saleBase = round2(saleBase + res[l.key].sale);
  }
  for (const l of input.lines) {
    if (l.price_basis === "pct_sale") put(l, qtyOf(l), ((l.unit_cost ?? 0) / 100) * saleBase);
  }

  // รวมรายหมวด
  const categories: Record<number, CategoryResult> = {};
  for (const c of input.categories) {
    categories[c.id] = { id: c.id, is_addon: c.is_addon, // หมวดเสริมที่ยังไม่ตั้งวิธีคิดเงิน = รวมในราคา (ค่าเริ่มต้นที่เคาะ 6 ต.ค. — แบบไฟล์เดิม) ไม่ใช่หายจากยอดเงียบๆ
      mode: c.is_addon ? (input.addon_modes[c.id] ?? "included") : null, lines: 0, pending: 0, share: 0, ...zero() };
  }
  for (const l of input.lines) {
    const r = res[l.key]; const c = categories[l.category_id];
    if (!r || !c) continue;
    addTo(c, r); c.lines++; if (r.pending) c.pending++;
  }

  const material = zero(); const labor = zero(); const addon_included = zero(); const addon_optional = zero();
  for (const c of Object.values(categories)) {
    if (!c.is_addon) addTo(c.id === LABOR_CATEGORY ? labor : material, c);
    else if (c.mode === "included") addTo(addon_included, c);
    else if (c.mode === "optional") addTo(addon_optional, c);
  }
  const subtotal = zero(); addTo(subtotal, material); addTo(subtotal, labor); addTo(subtotal, addon_included);
  const vatRate = (Number(input.vat_pct) || 0) / 100;
  const vat = { cost: round2(subtotal.cost * vatRate), sale: round2(subtotal.sale * vatRate) };
  const grand = { cost: round2(subtotal.cost + vat.cost), sale: round2(subtotal.sale + vat.sale) };

  for (const r of Object.values(res)) r.share = subtotal.cost > 0 ? r.cost / subtotal.cost : 0;
  for (const c of Object.values(categories)) c.share = subtotal.cost > 0 ? c.cost / subtotal.cost : 0;

  return {
    capacity_wp, lines: res, categories, material, labor, addon_included, addon_optional, subtotal, vat, grand,
    pending_lines: Object.values(res).filter((r) => r.pending).length,
  };
}

/** บาทต่อ Wp — ไฟล์แสดงคู่กับยอดบาททุกหมวด */
export const perWp = (amount: number, capacity_wp: number) => (capacity_wp > 0 ? amount / capacity_wp : 0);
