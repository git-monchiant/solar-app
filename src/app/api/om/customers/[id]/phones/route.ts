import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// เบอร์ของลูกค้า — เพิ่ม · ลบ · ตั้งเป็นเบอร์หลัก (log ทุกครั้ง)

const norm = (v: unknown) => String(v ?? "").replace(/\D/g, "");

async function log(tx: sql.Transaction, cid: number, uid: number, action: string, detail: string) {
  await new sql.Request(tx).input("c", sql.Int, cid).input("u", sql.Int, uid)
    .input("a", sql.VarChar(20), action).input("r", sql.NVarChar(300), detail)
    .query(`INSERT INTO om_customer_history (customer_id, [action], actor_user_id, reason) VALUES (@c, @a, @u, @r)`);
}

// POST { phone, primary? } — เพิ่มเบอร์
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const b = await req.json().catch(() => ({}));
  const phone = norm(b.phone);
  if (!/^0\d{9}$/.test(phone)) return NextResponse.json({ error: "เบอร์ต้องเป็น 10 หลักขึ้นต้นด้วย 0" }, { status: 400 });

  const db = await getOmDb();
  const dup = await db.request().input("c", sql.Int, id).input("p", sql.VarChar(20), phone)
    .query(`SELECT id FROM om_customer_phones WHERE customer_id = @c AND phone = @p`);
  if (dup.recordset[0]) return NextResponse.json({ error: "มีเบอร์นี้อยู่แล้ว" }, { status: 409 });

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    if (b.primary) {
      await new sql.Request(tx).input("c", sql.Int, id)
        .query(`UPDATE om_customer_phones SET is_primary = 0 WHERE customer_id = @c`);
    }
    await new sql.Request(tx).input("c", sql.Int, id).input("p", sql.VarChar(20), phone)
      .input("pr", sql.Bit, b.primary ? 1 : 0)
      .query(`INSERT INTO om_customer_phones (customer_id, phone, is_primary, source)
              SELECT @c, @p, CASE WHEN @pr = 1 OR NOT EXISTS
                (SELECT 1 FROM om_customer_phones WHERE customer_id = @c) THEN 1 ELSE 0 END, 'admin'`);
    await log(tx, id, gate.userId, "phone_add", `เพิ่มเบอร์ ${phone}`);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// PATCH { phone } — ตั้งเป็นเบอร์หลัก
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const phone = norm((await req.json().catch(() => ({}))).phone);

  const db = await getOmDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    await new sql.Request(tx).input("c", sql.Int, id)
      .query(`UPDATE om_customer_phones SET is_primary = 0 WHERE customer_id = @c`);
    const r = await new sql.Request(tx).input("c", sql.Int, id).input("p", sql.VarChar(20), phone)
      .query(`UPDATE om_customer_phones SET is_primary = 1 WHERE customer_id = @c AND phone = @p`);
    if (!r.rowsAffected[0]) throw new Error("ไม่พบเบอร์นี้");
    await log(tx, id, gate.userId, "update", `ตั้ง ${phone} เป็นเบอร์หลัก`);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE { phone } — ลบเบอร์ (ถ้าลบเบอร์หลัก เบอร์ถัดไปขึ้นเป็นหลักแทน)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const phone = norm((await req.json().catch(() => ({}))).phone);

  const db = await getOmDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const r = await new sql.Request(tx).input("c", sql.Int, id).input("p", sql.VarChar(20), phone)
      .query(`DELETE FROM om_customer_phones WHERE customer_id = @c AND phone = @p`);
    if (!r.rowsAffected[0]) throw new Error("ไม่พบเบอร์นี้");
    await new sql.Request(tx).input("c", sql.Int, id)
      .query(`UPDATE p SET is_primary = 1
              FROM om_customer_phones p
              WHERE p.customer_id = @c AND p.id = (SELECT MIN(id) FROM om_customer_phones WHERE customer_id = @c)
                AND NOT EXISTS (SELECT 1 FROM om_customer_phones WHERE customer_id = @c AND is_primary = 1)`);
    await log(tx, id, gate.userId, "phone_del", `ลบเบอร์ ${phone}`);
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e instanceof Error ? e.message : "ลบไม่สำเร็จ" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
