import { NextRequest, NextResponse } from "next/server";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// FAQ ฝั่งลูกค้า — เปิดอ่านได้โดยไม่ต้องยืนยันตัวตน (เป็นเนื้อหาสาธารณะ ไม่มีข้อมูลส่วนบุคคล)
export async function GET(_req: NextRequest) {
  const db = await getOmDb();
  const [r, c] = await Promise.all([
    db.request().query(
      `SELECT f.id, f.category, f.question, f.answer
       FROM om_faq f
       WHERE f.is_active = 1
       ORDER BY f.category_sort, f.sort_order, f.id`),
    // ชิปกรองเรียงตามลำดับที่แอดมินตั้งไว้ (ไม่ใช่ลำดับที่บังเอิญเจอใน FAQ)
    db.request().query(
      `SELECT category name, MIN(category_sort) s FROM om_faq
       WHERE is_active = 1 AND category IS NOT NULL AND category <> N''
       GROUP BY category ORDER BY s, category`),
  ]);
  return NextResponse.json(
    { faqs: fixDates(r.recordset), categories: c.recordset.map((x) => x.name as string) },
    { headers: { "Cache-Control": "no-store" } });
}

// POST { id } — นับยอดเปิดอ่าน (ใช้ดูว่าคำถามไหนถูกถามบ่อย → เอาไปปรับบริการ)
export async function POST(req: NextRequest) {
  const { id } = await req.json().catch(() => ({ id: 0 }));
  if (!id) return NextResponse.json({ ok: false });
  const db = await getOmDb();
  await db.request().input("id", sql.Int, Number(id))
    .query(`UPDATE om_faq SET view_count = view_count + 1 WHERE id = @id`);
  return NextResponse.json({ ok: true });
}
