import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_BOQ_ROLES, boqStageLocked } from "@/lib/b2b/boq";
import { stageLabel } from "@/lib/b2b/project";
import { logActivity, syncBoqHeaders } from "@/lib/b2b/project-server";

// ออก Revision ใหม่ = copy ทั้งใบเป็น Rev ถัดไป (snapshot ราคาเดิมติดไปด้วย) · Rev เดิมกลายเป็นอ่านอย่างเดียว
// โครงการผ่านขั้นราคายืนยันแล้ว (ได้งาน/ปิด/แพ้/ยกเลิก) ออก Rev ไม่ได้ — BOQ ที่ได้งานเป็นงบโครงการ
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_BOQ_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    const cur = (await new sql.Request(tx).input("id", sql.Int, id)
      .query(`SELECT b.id, b.root_id, b.is_latest, (SELECT stage FROM b2b_projects p WHERE p.id = b.project_id) AS project_stage
              FROM b2b_boqs b WITH (UPDLOCK, ROWLOCK) WHERE b.id = @id`)).recordset[0];
    if (!cur) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบใบ BOQ" }, { status: 404 }); }
    if (!cur.is_latest) { await tx.rollback(); return NextResponse.json({ error: "ออก Revision ใหม่ได้จาก Revision ล่าสุดเท่านั้น" }, { status: 409 }); }
    if (boqStageLocked(cur.project_stage)) {
      await tx.rollback();
      return NextResponse.json({ error: `โครงการอยู่ขั้น "${stageLabel(cur.project_stage)}" แล้ว — ออก Revision ใหม่ไม่ได้` }, { status: 409 });
    }
    const ins = await new sql.Request(tx).input("id", sql.Int, id).input("root", sql.Int, cur.root_id ?? cur.id).input("u", sql.Int, gate.userId)
      .query(`
        INSERT INTO b2b_boqs (doc_no, revision, root_id, is_latest, project_id, option_label, project_name, customer_name, location, latitude, longitude,
                              margin_pct, vat_pct, addon_modes, note, capacity_wp, total_cost, total_sale, pending_lines, created_by, updated_by)
        OUTPUT INSERTED.id, INSERTED.revision, INSERTED.project_id, INSERTED.doc_no, INSERTED.option_label
        SELECT doc_no, revision + 1, @root, 1, project_id, option_label, project_name, customer_name, location, latitude, longitude,
               margin_pct, vat_pct, addon_modes, note, capacity_wp, total_cost, total_sale, pending_lines, @u, @u
        FROM b2b_boqs WHERE id = @id;
        UPDATE b2b_boqs SET is_latest = 0 WHERE id = @id;`);
    const newId = ins.recordset[0].id as number;
    await new sql.Request(tx).input("from", sql.Int, id).input("to", sql.Int, newId).query(`
      INSERT INTO b2b_boq_items (boq_id, category_id, sort_order, line_type, material_id, subgroup, name, brand, model, unit,
                                 spec_watt, price_basis, unit_cost, qty, note, price_entered_by)
      SELECT @to, category_id, sort_order, line_type, material_id, subgroup, name, brand, model, unit,
             spec_watt, price_basis, unit_cost, qty, note, price_entered_by
      FROM b2b_boq_items WHERE boq_id = @from ORDER BY category_id, sort_order, id`);
    const n = ins.recordset[0];
    if (n.project_id) {
      // Rev ใหม่ของใบในโครงการ: หัวใบดึงชื่อ/ที่ตั้งล่าสุดของโครงการ + ลง timeline
      await syncBoqHeaders(tx, n.project_id);
      await logActivity(tx, n.project_id, "boq_revision", { message: `${n.doc_no} ออก Rev ${n.revision}${n.option_label ? ` · ${n.option_label}` : ""}`, userId: gate.userId });
    }
    await tx.commit();
    return NextResponse.json({ id: newId, revision: ins.recordset[0].revision }, { status: 201 });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("POST /api/b2b/boqs/[id]/revision error:", e);
    return NextResponse.json({ error: "ออก Revision ใหม่ไม่สำเร็จ" }, { status: 500 });
  }
}
