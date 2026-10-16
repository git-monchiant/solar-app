// เทสต์ตัวคำนวณใบ BOQ (โมดูล B2B) — node --experimental-strip-types scripts/tests/b2b-boq-calc.mjs
// ตัวเลขชุดนี้ตั้งให้คิดมือได้ · เทียบกับไฟล์ Excel จริงของทีมแล้ว ต้นทุนตรงทุกหมวด (แผน 20261005-01 เฟส 3)
import assert from "node:assert/strict";
import { calcBoq, perWp, round2 } from "../../src/lib/b2b/boq-calc.ts";

const categories = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, is_addon: i + 1 >= 19 }));
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} ≠ ${b}`);

const lines = [
  // แผง 100 แผง × 700 W × 4.5 บาท/W = 315,000 · ขนาดระบบ 70,000 Wp
  { key: "pv", category_id: 1, price_basis: "watt", unit_cost: 4.5, qty: 100, spec_watt: 700 },
  { key: "inv", category_id: 2, price_basis: "unit", unit_cost: 100000, qty: 1, spec_watt: null },
  { key: "clamp", category_id: 3, price_basis: "unit", unit_cost: 20, qty: 500, spec_watt: null },     // 10,000
  { key: "acc3", category_id: 3, price_basis: "pct_category", unit_cost: 2, qty: 1, spec_watt: null },  // 2% × 10,000 = 200
  { key: "wait", category_id: 4, price_basis: "unit", unit_cost: null, qty: 3, spec_watt: null },      // รอราคา
  { key: "labor", category_id: 17, price_basis: "system_wp", unit_cost: 2, qty: 1, spec_watt: null },  // 70,000 × 2 = 140,000
  { key: "ins", category_id: 18, price_basis: "pct_sale", unit_cost: 0.5, qty: 2, spec_watt: null },   // 0.5% × ยอดขาย 1–17 × 2 ปี
  { key: "roof", category_id: 19, price_basis: "unit", unit_cost: 50000, qty: 1, spec_watt: null },    // ส่วนเสริม รวมในราคา
  { key: "batt", category_id: 25, price_basis: "unit", unit_cost: 80000, qty: 1, spec_watt: null },    // ส่วนเสริม ทางเลือก
];
const r = calcBoq({ lines, categories, margin_pct: 20, vat_pct: 7, addon_modes: { 19: "included", 25: "optional" } });

assert.equal(r.capacity_wp, 70000, "ขนาดระบบ = Σ แผง × W");
near(r.lines.pv.cost, 315000, "แผงคิดต่อวัตต์");
near(r.lines.pv.unit_cost, 3150, "ต้นทุนต่อแผง = W × บาท/W");
near(r.lines.acc3.cost, 200, "Accessories = % ของต้นทุนบรรทัดอื่นในหมวด");
near(r.lines.labor.eff_qty, 70000, "ค่าแรงต่อ Wp ใช้ขนาดระบบเป็นจำนวน");
near(r.lines.labor.cost, 140000, "ค่าแรง = Wp × อัตรา");
assert.equal(r.lines.wait.pending, true, "ไม่มีราคา = รอราคา");
near(r.lines.wait.cost, 0, "รอราคาคิดเป็น 0");
assert.equal(r.pending_lines, 1);

const sale = (c) => c / 0.8;   // margin 20% ⇒ ขาย = ต้นทุน ÷ 0.8
near(r.lines.inv.sale, 125000, "ราคาขาย = ต้นทุน ÷ (1 − margin)");
const sale117 = sale(315000 + 100000 + 10000 + 200 + 0 + 140000);
near(r.lines.ins.cost, 0.005 * sale117 * 2, "ประกันภัย = % × ยอดขายหมวด 1–17 × จำนวนปี");

near(r.labor.cost, 140000, "ค่าแรง = หมวด 17");
near(r.material.cost, 315000 + 100000 + 10200 + r.lines.ins.cost, "ค่าวัสดุ = หมวดมาตรฐานยกเว้น 17");
near(r.addon_included.cost, 50000, "ส่วนเสริมที่รวมในราคา");
near(r.addon_optional.cost, 80000, "ส่วนเสริมทางเลือกแยกออก");
near(r.subtotal.cost, r.material.cost + r.labor.cost + r.addon_included.cost, "วัสดุ + แรง + ส่วนเสริม = ยอดก่อน VAT");
// VAT ปัดเป็นสตางค์แบบ ROUND ของ Excel แล้วค่อยบวก (a4aa90c) — ชุดนี้ได้ 54,448.1875 → .19
near(r.vat.sale, round2(r.subtotal.sale * 0.07), "VAT 7% ของยอดขาย ปัดสตางค์");
near(r.grand.sale, r.subtotal.sale + r.vat.sale, "สุทธิ = ก่อน VAT + VAT ที่แสดง");
near(perWp(r.lines.pv.cost, r.capacity_wp), 4.5, "บาท/Wp");

// หมวดเสริมที่ยังไม่ตั้งวิธีคิดเงิน = รวมในราคา
const r2 = calcBoq({ lines: [lines[7]], categories, margin_pct: 15, vat_pct: 7, addon_modes: {} });
near(r2.subtotal.cost, 50000, "หมวดเสริมค่าเริ่มต้น = รวมในราคา");

console.log("b2b-boq-calc tests passed");
