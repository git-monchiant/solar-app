import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { OM_WORK_ROLES } from "@/lib/om/om-roles";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { omErrorText } from "@/lib/om/api-error";

// ★ 21 ต.ค. 69 แผน 20261021-01: ข้อความประวัติขึ้นในหน้าลูกค้า — เขียนเป็นบ้านเลขที่ ไม่ใช้ id/ชื่อคอลัมน์
const ROLE_TH: Record<string, string> = { owner: "เจ้าของ", resident: "ผู้อยู่อาศัย", contact: "ผู้ติดต่อ" };
const houseText = (no: unknown, project: unknown) => `บ้านเลขที่ ${no ?? "-"}${project ? ` · ${project}` : ""}`;

// การผูกบ้านของลูกค้า — ผูก (พร้อม role) · ถอด · หลักการ: บ้าน↔คน many-to-many ผ่าน om_house_customers

// POST { house_id, role } — ผูกบ้าน
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyRole(req, OM_WORK_ROLES);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const b = await req.json().catch(() => ({}));
  const houseId = Number(b.house_id);
  const role = ["owner", "resident", "contact"].includes(b.role) ? b.role : "contact";
  if (!houseId) return NextResponse.json({ error: "กรุณาเลือกบ้าน" }, { status: 400 });

  const db = await getOmDb();
  const chk = await db.request().input("h", sql.Int, houseId).input("c", sql.Int, id).query(`
    SELECT (SELECT COUNT(*) FROM om_houses WHERE id = @h) house_found,
           (SELECT house_number FROM om_houses WHERE id = @h) house_number,
           (SELECT ISNULL(pj.name_th, h.project_name) FROM om_houses h
              LEFT JOIN om_projects pj ON pj.project_id = h.project_id WHERE h.id = @h) project_name,
           (SELECT COUNT(*) FROM om_house_customers WHERE house_id = @h AND customer_id = @c AND is_current = 1) already`);
  if (!chk.recordset[0].house_found) return NextResponse.json({ error: "ไม่พบบ้าน" }, { status: 404 });
  if (chk.recordset[0].already) return NextResponse.json({ error: "เชื่อมโยงบ้านนี้อยู่แล้ว" }, { status: 409 });

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    await new sql.Request(tx).input("h", sql.Int, houseId).input("c", sql.Int, id).input("r", sql.VarChar(10), role)
      .query(`INSERT INTO om_house_customers (house_id, customer_id, role, is_current, source)
              VALUES (@h, @c, @r, 1, 'admin')`);
    await new sql.Request(tx).input("c", sql.Int, id).input("u", sql.Int, gate.userId)
      .input("r", sql.NVarChar(300),
        `เชื่อมโยง${houseText(chk.recordset[0].house_number, chk.recordset[0].project_name)} (${ROLE_TH[role] ?? role})`)
      .query(`INSERT INTO om_customer_history (customer_id, [action], actor_user_id, reason)
              VALUES (@c, 'link_house', @u, @r)`);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: omErrorText(e, "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "POST /api/om/customers/[id]/houses") }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE { link_id } — ถอดการผูก (ปิด is_current ไม่ลบทิ้ง — ประวัติไม่หาย)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyRole(req, OM_WORK_ROLES);
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
    if (!r.rowsAffected[0]) throw new Error("ไม่พบการเชื่อมโยงนี้");
    const h = (await new sql.Request(tx).input("l", sql.Int, linkId).query(`
      SELECT h.house_number, ISNULL(pj.name_th, h.project_name) project_name
        FROM om_house_customers hc JOIN om_houses h ON h.id = hc.house_id
        LEFT JOIN om_projects pj ON pj.project_id = h.project_id
       WHERE hc.id = @l`)).recordset[0];
    await new sql.Request(tx).input("c", sql.Int, id).input("u", sql.Int, gate.userId)
      .input("r", sql.NVarChar(300), `ยกเลิกการเชื่อมโยง${houseText(h?.house_number, h?.project_name)}`)
      .query(`INSERT INTO om_customer_history (customer_id, [action], actor_user_id, reason)
              VALUES (@c, 'unlink_house', @u, @r)`);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: omErrorText(e, "ยกเลิกการเชื่อมโยงไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "DELETE /api/om/customers/[id]/houses") }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
