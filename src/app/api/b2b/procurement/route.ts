import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb } from "@/lib/b2b/db";
import { calcBoq, round2 } from "@/lib/b2b/boq-calc";
import { loadBoq, loadCategories } from "@/lib/b2b/boq-server";

// งานจัดซื้อของโครงการ B2B (แผน 20261015-07 เฟส 4 · คำถามข้อ 4 "ตามเสนอ": Purchase เห็นเฉพาะขั้นจัดซื้อ + งบต้นทุน)
// โครงการที่รับเงินงวด 1 แล้ว (ขั้น 3600–3800) + งบ = BOQ ที่ได้งาน — ★ ส่งต้นทุนอย่างเดียว ไม่มีราคาขาย/ใบเสนอราคา/มูลค่าสัญญา
// สั่งของครบ = บันทึก milestone "procured" ผ่าน /api/b2b/projects/[id]/milestones
// ★ ไม่ส่งบรรทัด "% ของยอดขาย" (ประกันภัยโครงการ) — ต้นทุนบรรทัดนี้ = % × ยอดขาย หารกลับได้ราคาขาย/margin (ทบทวน BOQ 15 ต.ค.)
//   งบรวม/งบหมวด = ผลบวกบรรทัดที่ส่งเท่านั้น
export async function GET(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, ["purchase", "b2b", "admin"]);
  if (gate.error) return gate.error;
  const db = await getB2bDb();
  const r = await db.request().query(`
    SELECT p.id, p.code, p.name, p.stage, p.location, c.name AS customer_name, p.won_boq_id,
           m.id AS procured_id, CONVERT(char(10), m.done_date, 23) AS procured_date, m.note AS procured_note, m.files_json AS procured_files,
           mu.full_name AS procured_by_name,
           CONVERT(char(10), ma.done_date, 23) AS arrived_date
    FROM b2b_projects p
    JOIN b2b_customers c ON c.id = p.customer_id
    LEFT JOIN b2b_project_milestones m ON m.project_id = p.id AND m.kind = 'procured'
    LEFT JOIN users mu ON mu.id = m.created_by
    LEFT JOIN b2b_project_milestones ma ON ma.project_id = p.id AND ma.kind = 'materials_arrived'
    WHERE p.stage IN (3600, 3700, 3800) AND p.won_boq_id IS NOT NULL
    ORDER BY CASE WHEN m.id IS NULL THEN 0 ELSE 1 END, p.updated_at DESC`);
  const categories = await loadCategories(db);
  const out = [];
  for (const p of r.recordset) {
    const boq = await loadBoq(db, p.won_boq_id);
    if (!boq) continue;
    const calc = calcBoq({
      lines: boq.lines.map((l) => ({ key: l.key, category_id: l.category_id, price_basis: l.price_basis, unit_cost: l.unit_cost, qty: l.qty, spec_watt: l.spec_watt })),
      categories, margin_pct: boq.header.margin_pct, vat_pct: boq.header.vat_pct, addon_modes: boq.header.addon_modes,
    });
    // หมวดที่มีบรรทัด + ต้นทุนรายบรรทัด (ส่วนเสริมแบบทางเลือกไม่อยู่ในงบ · ไม่มีบรรทัด % ของยอดขาย)
    const shown = boq.lines.filter((l) => l.price_basis !== "pct_sale");
    const cats = categories
      .filter((c) => shown.some((l) => l.category_id === c.id) && !(c.is_addon && boq.header.addon_modes[c.id] === "optional"))
      .map((c) => {
        const lines = shown.filter((l) => l.category_id === c.id).map((l) => ({
          name: l.name, brand: l.brand, model: l.model, unit: l.unit,
          qty: calc.lines[l.key]?.eff_qty ?? l.qty, unit_cost: calc.lines[l.key]?.unit_cost ?? l.unit_cost, cost: calc.lines[l.key]?.cost ?? 0,
        }));
        return { id: c.id, name: c.name, cost: round2(lines.reduce((s, l) => s + l.cost, 0)), lines };
      });
    out.push({
      id: p.id, code: p.code, name: p.name, stage: p.stage, location: p.location, customer_name: p.customer_name,
      boq: { id: boq.header.id, doc_no: boq.header.doc_no, revision: boq.header.revision, option_label: boq.header.option_label, capacity_wp: calc.capacity_wp },
      total_cost: round2(cats.reduce((s, c) => s + c.cost, 0)), categories: cats,
      procured: p.procured_id ? { id: p.procured_id, date: p.procured_date, note: p.procured_note, by: p.procured_by_name, files: p.procured_files ? JSON.parse(p.procured_files) : [] } : null,
      arrived_date: p.arrived_date,
    });
  }
  return NextResponse.json(out);
}
