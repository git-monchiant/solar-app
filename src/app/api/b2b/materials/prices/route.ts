import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_PRICE_EDIT_ROLES, readPriceBody } from "@/lib/b2b/materials";
import { BOQ_EDITABLE_MAX_STAGE } from "@/lib/b2b/boq";
import { storeTotals } from "@/lib/b2b/boq-server";
import { logActivity } from "@/lib/b2b/project-server";

// Purchase ใส่ / ปรับราคา — หลายแถวพร้อมกัน (กรอกต่อเนื่องในตาราง) + หมายเหตุชุดเดียว
// ทุกแถวที่ราคาเปลี่ยนจริงบันทึกประวัติ · ราคาเท่าเดิมข้าม (ไม่สร้างประวัติขยะ) · ทั้งชุดอยู่ใน transaction เดียว
// ★ บรรทัด "รอราคา" ใน BOQ ที่ยังแก้ได้ รับราคาใหม่เอง + คำนวณยอดหัวใบใหม่ (ทบทวน BOQ 15 ต.ค.)
//   เดิมต้องให้ Solar B2B เปิดใบแล้วกดบันทึกเอง แต่ปุ่มบันทึกกดไม่ได้ (ไม่มีอะไรเปลี่ยน) → ยอดรอราคาค้าง ใบเสนอราคาส่งอนุมัติไม่ได้
//   เฉพาะ Rev ล่าสุด · ใบเสนอราคายังไม่ส่ง · โครงการยังไม่ผ่านขั้นราคายืนยัน · หน่วยคิดราคา/วัตต์ของบรรทัดตรงกับ Master (กันราคาความหมายผิด)
export async function PUT(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, B2B_PRICE_EDIT_ROLES);
  if (gate.error) return gate.error;
  const parsed = readPriceBody(await req.json().catch(() => ({})));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { items, note } = parsed.value;
  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    let changed = 0;
    const priced: number[] = [];
    for (const it of items) {
      // UPDLOCK กันสองคนแก้แถวเดียวกันพร้อมกันแล้วประวัติ "ราคาเดิม" เพี้ยน
      const cur = await new sql.Request(tx).input("id", sql.Int, it.id)
        .query(`SELECT unit_price FROM b2b_materials WITH (UPDLOCK, ROWLOCK) WHERE id = @id`);
      if (cur.recordset.length === 0) throw new Error(`ไม่พบรายการ #${it.id}`);
      const old = cur.recordset[0].unit_price == null ? null : Number(cur.recordset[0].unit_price);
      if (old === it.price) continue;
      await new sql.Request(tx)
        .input("id", sql.Int, it.id)
        .input("price", sql.Decimal(14, 4), it.price)
        .input("old", sql.Decimal(14, 4), old)
        .input("note", sql.NVarChar(500), note)
        .input("u", sql.Int, gate.userId)
        .query(`
          UPDATE b2b_materials SET unit_price = @price, price_updated_by = @u, price_updated_at = SYSDATETIMEOFFSET() WHERE id = @id;
          INSERT INTO b2b_material_prices (material_id, old_price, new_price, note, changed_by) VALUES (@id, @old, @price, @note, @u);`);
      changed++;
      if (it.price != null) priced.push(it.id);
    }
    let filled = 0;
    if (priced.length) {
      const ids = priced.join(",");   // id ตัวเลขจาก readPriceBody — ไม่ใช่ข้อความจากผู้ใช้
      const eligible = `
        i.material_id IN (${ids}) AND i.unit_cost IS NULL AND i.line_type = 'material'
        AND i.price_basis = m.price_basis AND ISNULL(i.spec_watt, -1) = ISNULL(m.spec_watt, -1)
        AND b.is_latest = 1
        AND NOT EXISTS (SELECT 1 FROM b2b_quotations q WHERE q.boq_id = b.id AND q.status NOT IN ('draft', 'changes_required'))
        AND (b.project_id IS NULL OR EXISTS (SELECT 1 FROM b2b_projects p WHERE p.id = b.project_id AND p.stage <= ${BOQ_EDITABLE_MAX_STAGE}))`;
      const boqs = (await new sql.Request(tx).query(`
        SELECT DISTINCT b.id, b.doc_no, b.revision, b.project_id
        FROM b2b_boq_items i JOIN b2b_boqs b ON b.id = i.boq_id JOIN b2b_materials m ON m.id = i.material_id
        WHERE ${eligible}`)).recordset;
      for (const b of boqs) {
        // ล็อกหัวใบก่อน — กันชนกับ Solar B2B ที่กำลังบันทึกใบนี้ (PUT ล็อกแถวเดียวกัน)
        await new sql.Request(tx).input("b", sql.Int, b.id).query(`SELECT id FROM b2b_boqs WITH (UPDLOCK, ROWLOCK) WHERE id = @b`);
        const r = await new sql.Request(tx).input("b", sql.Int, b.id).query(`
          UPDATE i SET unit_cost = m.unit_price
          FROM b2b_boq_items i JOIN b2b_boqs b ON b.id = i.boq_id JOIN b2b_materials m ON m.id = i.material_id
          WHERE i.boq_id = @b AND ${eligible}`);
        const n = r.rowsAffected[0] ?? 0;
        if (!n) continue;
        filled += n;
        await storeTotals(tx, b.id);
        if (b.project_id) await logActivity(tx, b.project_id, "boq_priced", { message: `Purchase ใส่ราคาแล้ว — ${b.doc_no} Rev ${b.revision} รับราคา ${n} บรรทัดที่รออยู่`, userId: gate.userId });
      }
    }
    await tx.commit();
    return NextResponse.json({ ok: true, changed, filled });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("PUT /api/b2b/materials/prices error:", e);
    return NextResponse.json({ error: e instanceof Error && e.message ? e.message : "บันทึกราคาไม่สำเร็จ" }, { status: 500 });
  }
}
