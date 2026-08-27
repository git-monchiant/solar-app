import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// ทะเบียนหมวด FAQ — คุมรายชื่อ+ลำดับชิปกรองที่ลูกค้าเห็น
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const db = await getOmDb();
  const r = await db.request().query(
    `SELECT c.id, c.name, c.sort_order, c.is_active,
            (SELECT COUNT(*) FROM om_faq f WHERE f.category = c.name) AS used_count
     FROM om_faq_categories c ORDER BY c.sort_order, c.id`);
  return NextResponse.json({ categories: r.recordset });
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const name = String((await req.json().catch(() => ({}))).name || "").trim();
  if (!name) return NextResponse.json({ error: "ต้องใส่ชื่อหมวด" }, { status: 400 });

  const db = await getOmDb();
  const dup = await db.request().input("n", sql.NVarChar(60), name)
    .query(`SELECT 1 x FROM om_faq_categories WHERE name = @n`);
  if (dup.recordset.length) return NextResponse.json({ error: "มีหมวดนี้อยู่แล้ว" }, { status: 409 });

  await db.request().input("n", sql.NVarChar(60), name)
    .query(`INSERT INTO om_faq_categories (name, sort_order)
            SELECT @n, ISNULL(MAX(sort_order), 0) + 10 FROM om_faq_categories`);
  return NextResponse.json({ ok: true }, { status: 201 });
}

// PATCH { id, name?, sort_order?, is_active? }
// ★ เปลี่ยนชื่อหมวด = อัปเดตข้อความใน om_faq ตามไปด้วย (ทรานแซกชันเดียว) ไม่งั้น FAQ จะหลุดหมวด
export async function PATCH(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const db = await getOmDb();
  const cur = await db.request().input("id", sql.Int, Number(b.id))
    .query(`SELECT name FROM om_faq_categories WHERE id = @id`);
  if (!cur.recordset[0]) return NextResponse.json({ error: "ไม่พบหมวด" }, { status: 404 });
  const oldName: string = cur.recordset[0].name;
  const newName = b.name === undefined ? null : String(b.name).trim();
  if (b.name !== undefined && !newName) {
    return NextResponse.json({ error: "ชื่อหมวดห้ามว่าง" }, { status: 400 });
  }

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    await new sql.Request(tx)
      .input("id", sql.Int, Number(b.id))
      .input("n", sql.NVarChar(60), newName)
      .input("sort", sql.Int, b.sort_order === undefined ? null : Number(b.sort_order))
      .input("act", sql.Bit, b.is_active === undefined ? null : (b.is_active ? 1 : 0))
      .query(`UPDATE om_faq_categories SET
                name       = COALESCE(@n, name),
                sort_order = COALESCE(@sort, sort_order),
                is_active  = COALESCE(@act, is_active)
              WHERE id = @id`);
    if (newName && newName !== oldName) {
      await new sql.Request(tx)
        .input("old", sql.NVarChar(60), oldName)
        .input("new", sql.NVarChar(60), newName)
        .query(`UPDATE om_faq SET category = @new WHERE category = @old`);
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => {});
    return NextResponse.json(
      { error: e instanceof Error ? e.message.includes("UQ_om_faq_categories_name") ? "ชื่อหมวดซ้ำ" : e.message : "บันทึกไม่สำเร็จ" },
      { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE ?id= — ลบได้เฉพาะหมวดที่ไม่มี FAQ ใช้อยู่ (กันข้อมูลกำพร้า)
export async function DELETE(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  const db = await getOmDb();
  const used = await db.request().input("id", sql.Int, id).query(
    `SELECT COUNT(*) n FROM om_faq f JOIN om_faq_categories c ON c.name = f.category WHERE c.id = @id`);
  if (used.recordset[0].n > 0) {
    return NextResponse.json(
      { error: `ยังมี ${used.recordset[0].n} คำถามใช้หมวดนี้ — ย้ายหมวดก่อนจึงจะลบได้` }, { status: 409 });
  }
  await db.request().input("id", sql.Int, id).query(`DELETE FROM om_faq_categories WHERE id = @id`);
  return NextResponse.json({ ok: true });
}
