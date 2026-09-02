import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// รวมลูกค้าซ้ำ — [id] คือตัวหลักที่เก็บไว้ · body { loser_id } คือคนที่ถูกยุบ
// ย้ายเบอร์/การผูกบ้านที่ไม่ซ้ำมาหาตัวหลัก แล้วซ่อนตัวที่ยุบ (ไม่ลบ — ย้อนดูได้)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const keepId = Number((await ctx.params).id);
  const loseId = Number((await req.json().catch(() => ({}))).loser_id);
  if (!loseId || loseId === keepId) return NextResponse.json({ error: "ต้องระบุคนที่จะยุบ (ไม่ใช่คนเดียวกัน)" }, { status: 400 });

  const db = await getOmDb();
  const chk = await db.request().input("k", sql.Int, keepId).input("l", sql.Int, loseId).query(`
    SELECT (SELECT COUNT(*) FROM om_customers WHERE id = @k AND is_active = 1) keep_ok,
           (SELECT COUNT(*) FROM om_customers WHERE id = @l) lose_ok,
           (SELECT full_name FROM om_customers WHERE id = @l) lose_name`);
  const c = chk.recordset[0];
  if (!c.keep_ok || !c.lose_ok) return NextResponse.json({ error: "ไม่พบลูกค้า" }, { status: 404 });

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    // เบอร์: ย้ายเฉพาะที่ตัวหลักยังไม่มี · ที่ซ้ำลบออกจากตัวยุบ
    const mv = await new sql.Request(tx).input("k", sql.Int, keepId).input("l", sql.Int, loseId).query(`
      UPDATE p SET p.customer_id = @k, p.is_primary = 0
      FROM om_customer_phones p
      WHERE p.customer_id = @l
        AND NOT EXISTS (SELECT 1 FROM om_customer_phones x WHERE x.customer_id = @k AND x.phone = p.phone);
      DELETE FROM om_customer_phones WHERE customer_id = @l;`);
    // การผูกบ้าน: ย้ายเฉพาะบ้านที่ตัวหลักยังไม่ผูก · ที่ซ้ำปิด is_current
    const mh = await new sql.Request(tx).input("k", sql.Int, keepId).input("l", sql.Int, loseId).query(`
      UPDATE hc SET hc.customer_id = @k
      FROM om_house_customers hc
      WHERE hc.customer_id = @l AND hc.is_current = 1
        AND NOT EXISTS (SELECT 1 FROM om_house_customers x
                        WHERE x.customer_id = @k AND x.house_id = hc.house_id AND x.is_current = 1);
      UPDATE om_house_customers SET is_current = 0, valid_to = SYSDATETIMEOFFSET()
      WHERE customer_id = @l AND is_current = 1;`);
    // pointer เก่าในบ้าน
    await new sql.Request(tx).input("k", sql.Int, keepId).input("l", sql.Int, loseId)
      .query(`UPDATE om_houses SET primary_customer_id = @k WHERE primary_customer_id = @l`);
    // ซ่อนตัวยุบ + จดว่ารวมไปที่ไหน
    await new sql.Request(tx).input("k", sql.Int, keepId).input("l", sql.Int, loseId)
      .query(`UPDATE om_customers SET is_active = 0,
                note = CONCAT(ISNULL(note, ''), N' | รวมเข้ากับลูกค้า id ', @k),
                updated_at = SYSDATETIMEOFFSET()
              WHERE id = @l`);
    // log ทั้งสองฝั่ง
    for (const [cid, msg] of [
      [keepId, `รวมลูกค้า id ${loseId} ("${c.lose_name}") เข้ามา`],
      [loseId, `ถูกรวมเข้ากับลูกค้า id ${keepId} — ซ่อนแถวนี้`],
    ] as [number, string][]) {
      await new sql.Request(tx).input("c", sql.Int, cid).input("u", sql.Int, gate.userId)
        .input("r", sql.NVarChar(300), msg)
        .query(`INSERT INTO om_customer_history (customer_id, [action], actor_user_id, reason)
                VALUES (@c, 'merge', @u, @r)`);
    }
    await tx.commit();
    return NextResponse.json({
      ok: true,
      moved_phones: mv.rowsAffected[0] ?? 0,
      moved_houses: mh.rowsAffected[0] ?? 0,
    });
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e instanceof Error ? e.message : "รวมไม่สำเร็จ" }, { status: 500 });
  }
}
