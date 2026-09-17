import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// POST { id, direction: "up" | "down" } — สลับลำดับกับข้อที่อยู่ติดกัน "ในหมวดเดียวกัน"
// ★ ใช้วิธีสลับค่า sort_order สองแถว (ไม่ใช่ตั้งเป็น เพื่อนบ้าน±1 แบบเดิม)
//   เพราะ ±1 ทำให้ค่าชนกับข้ออื่นได้ เช่น 9,10,30 → เลื่อน 30 ขึ้นได้ 9 ซึ่งซ้ำกับข้อแรก
//   พอค่าซ้ำ ลำดับจะไม่นิ่ง (ตัดสินด้วย id แทน) — การสลับค่าตรง ๆ ไม่มีทางชน
export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const { id, direction } = await req.json().catch(() => ({}));
  if (!id || !["up", "down"].includes(direction)) {
    return NextResponse.json({ error: "ต้องระบุ id และ direction (up/down)" }, { status: 400 });
  }

  const db = await getOmDb();
  const cur = await db.request().input("id", sql.Int, Number(id))
    .query(`SELECT id, category, sort_order FROM om_faq WHERE id = @id`);
  const me = cur.recordset[0];
  if (!me) return NextResponse.json({ error: "ไม่พบคำถาม" }, { status: 404 });

  // เพื่อนบ้านในหมวดเดียวกัน (หมวดว่างถือเป็นกลุ่มเดียวกัน)
  const cmp = direction === "up" ? "<" : ">";
  const ord = direction === "up" ? "DESC" : "ASC";
  const nb = await db.request()
    .input("cat", sql.NVarChar(60), me.category)
    .input("sort", sql.Int, me.sort_order)
    .input("id", sql.Int, me.id)
    .query(`SELECT TOP 1 id, sort_order FROM om_faq
            WHERE ISNULL(category, N'') = ISNULL(@cat, N'')
              AND (sort_order ${cmp} @sort OR (sort_order = @sort AND id ${cmp} @id))
            ORDER BY sort_order ${ord}, id ${ord}`);
  const other = nb.recordset[0];
  if (!other) return NextResponse.json({ ok: true, moved: false });  // อยู่สุดขอบหมวดแล้ว

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    await new sql.Request(tx).input("a", sql.Int, me.id).input("v", sql.Int, other.sort_order)
      .query(`UPDATE om_faq SET sort_order = @v, updated_at = SYSDATETIMEOFFSET() WHERE id = @a`);
    await new sql.Request(tx).input("b", sql.Int, other.id).input("v", sql.Int, me.sort_order)
      .query(`UPDATE om_faq SET sort_order = @v, updated_at = SYSDATETIMEOFFSET() WHERE id = @b`);
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : "สลับลำดับไม่สำเร็จ" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, moved: true });
}
