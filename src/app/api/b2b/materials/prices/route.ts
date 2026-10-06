import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_PRICE_EDIT_ROLES, readPriceBody } from "@/lib/b2b/materials";

// Purchase ใส่ / ปรับราคา — หลายแถวพร้อมกัน (กรอกต่อเนื่องในตาราง) + หมายเหตุชุดเดียว
// ทุกแถวที่ราคาเปลี่ยนจริงบันทึกประวัติ · ราคาเท่าเดิมข้าม (ไม่สร้างประวัติขยะ) · ทั้งชุดอยู่ใน transaction เดียว
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
    }
    await tx.commit();
    return NextResponse.json({ ok: true, changed });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("PUT /api/b2b/materials/prices error:", e);
    return NextResponse.json({ error: e instanceof Error && e.message ? e.message : "บันทึกราคาไม่สำเร็จ" }, { status: 500 });
  }
}
