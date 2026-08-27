import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// FAQ ฝั่งแอดมิน — เนื้อหาที่ลูกค้าเห็นในหน้า LIFF /om/liff/faq
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const db = await getOmDb();
  const r = await db.request().query(
    `SELECT f.id, f.category, f.question, f.answer, f.sort_order, f.is_active, f.view_count, f.updated_at
     FROM om_faq f
     LEFT JOIN om_faq_categories c ON c.name = f.category
     ORDER BY ISNULL(c.sort_order, 999999), f.sort_order, f.id`);
  return NextResponse.json({ faqs: fixDates(r.recordset) });
}

// POST { category?, question, answer } — เพิ่มข้อใหม่ (ต่อท้ายลำดับ)
export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));
  const question = String(b.question || "").trim();
  const answer = String(b.answer || "").trim();
  if (!question || !answer) {
    return NextResponse.json({ error: "ต้องมีทั้งคำถามและคำตอบ" }, { status: 400 });
  }
  const db = await getOmDb();
  const r = await db.request()
    .input("cat", sql.NVarChar(60), b.category ? String(b.category).trim() : null)
    .input("q", sql.NVarChar(300), question)
    .input("a", sql.NVarChar(sql.MAX), answer)
    .input("by", sql.Int, gate.userId)
    .query(`INSERT INTO om_faq (category, question, answer, sort_order, updated_by)
            OUTPUT INSERTED.id
            SELECT @cat, @q, @a, ISNULL(MAX(sort_order), 0) + 10, @by FROM om_faq`);
  return NextResponse.json({ ok: true, id: r.recordset[0].id }, { status: 201 });
}

// PATCH { id, ...fields } — แก้ข้อเดิม (ส่งเฉพาะฟิลด์ที่เปลี่ยน)
export async function PATCH(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const db = await getOmDb();
  await db.request()
    .input("id", sql.Int, Number(b.id))
    .input("cat", sql.NVarChar(60), b.category === undefined ? null : (String(b.category).trim() || null))
    .input("setCat", sql.Bit, b.category === undefined ? 0 : 1)
    .input("q", sql.NVarChar(300), b.question ?? null)
    .input("a", sql.NVarChar(sql.MAX), b.answer ?? null)
    .input("sort", sql.Int, b.sort_order === undefined ? null : Number(b.sort_order))
    .input("act", sql.Bit, b.is_active === undefined ? null : (b.is_active ? 1 : 0))
    .input("by", sql.Int, gate.userId)
    .query(`UPDATE om_faq SET
              category   = CASE WHEN @setCat = 1 THEN @cat ELSE category END,
              question   = COALESCE(@q, question),
              answer     = COALESCE(@a, answer),
              sort_order = COALESCE(@sort, sort_order),
              is_active  = COALESCE(@act, is_active),
              updated_by = @by,
              updated_at = SYSDATETIMEOFFSET()
            WHERE id = @id`);
  return NextResponse.json({ ok: true });
}

// DELETE ?id= — ลบถาวร (FAQ เป็นเนื้อหา ไม่ใช่ธุรกรรม จึงลบได้)
export async function DELETE(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const db = await getOmDb();
  await db.request().input("id", sql.Int, id).query(`DELETE FROM om_faq WHERE id = @id`);
  return NextResponse.json({ ok: true });
}
