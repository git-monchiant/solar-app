import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// การผูกบ้านของลูกค้า — ผูก (พร้อม role) · ถอด · หลักการ: บ้าน↔คน many-to-many ผ่าน om_house_customers

// POST { house_id, role } — ผูกบ้าน
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const b = await req.json().catch(() => ({}));
  const houseId = Number(b.house_id);
  const role = ["owner", "resident", "contact"].includes(b.role) ? b.role : "contact";
  if (!houseId) return NextResponse.json({ error: "ต้องระบุบ้าน" }, { status: 400 });

  const db = await getOmDb();
  const chk = await db.request().input("h", sql.Int, houseId).input("c", sql.Int, id).query(`
    SELECT (SELECT COUNT(*) FROM om_houses WHERE id = @h) house_found,
           (SELECT COUNT(*) FROM om_house_customers WHERE house_id = @h AND customer_id = @c AND is_current = 1) already`);
  if (!chk.recordset[0].house_found) return NextResponse.json({ error: "ไม่พบบ้าน" }, { status: 404 });
  if (chk.recordset[0].already) return NextResponse.json({ error: "ผูกบ้านนี้อยู่แล้ว" }, { status: 409 });

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    await new sql.Request(tx).input("h", sql.Int, houseId).input("c", sql.Int, id).input("r", sql.VarChar(10), role)
      .query(`INSERT INTO om_house_customers (house_id, customer_id, role, is_current, source)
              VALUES (@h, @c, @r, 1, 'admin')`);
    await new sql.Request(tx).input("c", sql.Int, id).input("u", sql.Int, gate.userId)
      .input("r", sql.NVarChar(300), `ผูกบ้าน id ${houseId} (${role})`)
      .query(`INSERT INTO om_customer_history (customer_id, [action], actor_user_id, reason)
              VALUES (@c, 'link_house', @u, @r)`);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE { link_id } — ถอดการผูก (ปิด is_current ไม่ลบทิ้ง — ประวัติไม่หาย)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const linkId = Number((await req.json().catch(() => ({}))).link_id);

  const db = await getOmDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const r = await new sql.Request(tx).input("l", sql.Int, linkId).input("c", sql.Int, id)
      .query(`UPDATE om_house_customers SET is_current = 0, valid_to = SYSDATETIMEOFFSET()
              WHERE id = @l AND customer_id = @c AND is_current = 1`);
    if (!r.rowsAffected[0]) throw new Error("ไม่พบการผูกนี้");
    await new sql.Request(tx).input("c", sql.Int, id).input("u", sql.Int, gate.userId)
      .input("r", sql.NVarChar(300), `ถอดการผูกบ้าน (link ${linkId}) — ปิด is_current ประวัติยังอยู่`)
      .query(`INSERT INTO om_customer_history (customer_id, [action], actor_user_id, reason)
              VALUES (@c, 'unlink_house', @u, @r)`);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e instanceof Error ? e.message : "ถอดไม่สำเร็จ" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
