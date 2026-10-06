import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_BOQ_ROLES } from "@/lib/b2b/boq";

// ออก Revision ใหม่ = copy ทั้งใบเป็น Rev ถัดไป (snapshot ราคาเดิมติดไปด้วย) · Rev เดิมกลายเป็นอ่านอย่างเดียว
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
      .query(`SELECT id, root_id, is_latest FROM b2b_boqs WITH (UPDLOCK, ROWLOCK) WHERE id = @id`)).recordset[0];
    if (!cur) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบใบ BOQ" }, { status: 404 }); }
    if (!cur.is_latest) { await tx.rollback(); return NextResponse.json({ error: "ออก Revision ใหม่ได้จาก Revision ล่าสุดเท่านั้น" }, { status: 409 }); }
    const ins = await new sql.Request(tx).input("id", sql.Int, id).input("root", sql.Int, cur.root_id ?? cur.id).input("u", sql.Int, gate.userId)
      .query(`
        INSERT INTO b2b_boqs (doc_no, revision, root_id, is_latest, project_name, customer_name, location, latitude, longitude,
                              margin_pct, vat_pct, addon_modes, note, capacity_wp, total_cost, total_sale, pending_lines, created_by, updated_by)
        OUTPUT INSERTED.id, INSERTED.revision
        SELECT doc_no, revision + 1, @root, 1, project_name, customer_name, location, latitude, longitude,
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
    await tx.commit();
    return NextResponse.json({ id: newId, revision: ins.recordset[0].revision }, { status: 201 });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("POST /api/b2b/boqs/[id]/revision error:", e);
    return NextResponse.json({ error: "ออก Revision ใหม่ไม่สำเร็จ" }, { status: 500 });
  }
}
