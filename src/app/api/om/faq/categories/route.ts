import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// ทะเบียนหมวด FAQ — คุมรายชื่อ + ลำดับชิปกรองที่ลูกค้าเห็น
// ★ 10 ก.ย. 69 เลิกใช้ตาราง om_faq_categories (มีแค่ 4 แถว ทำหน้าที่แค่บอกลำดับ)
//   ผู้ใช้สั่ง "อย่าสร้างตารางเยอะเกินไป" ⇒ ย้ายมาเก็บใน om_settings คีย์ faq.categories
//   ชื่อหมวดตัวจริงอยู่ที่ om_faq.category (ข้อความ) · ลำดับซ้ำไว้ที่ om_faq.category_sort เพื่อ ORDER BY เร็ว ๆ
//   ⇒ อ้างอิงหมวดด้วย "ชื่อ" ไม่ใช่ id อีกต่อไป

const KEY = "faq.categories";
type Cat = { name: string; sort_order: number; is_active: boolean };

async function readCats(db: sql.ConnectionPool): Promise<Cat[]> {
  const r = await db.request().input("k", sql.NVarChar(80), KEY)
    .query(`SELECT value_json FROM om_settings WHERE [key] = @k COLLATE Latin1_General_BIN2`);
  const raw = r.recordset[0]?.value_json as string | null | undefined;
  if (raw) {
    try {
      const list = JSON.parse(raw) as Cat[];
      if (Array.isArray(list)) return list;
    } catch { /* ค่าเสีย — ตกไปสร้างใหม่จาก om_faq ข้างล่าง */ }
  }
  // ยังไม่เคยตั้ง — ถอดจากหมวดที่ FAQ ใช้อยู่จริง
  const f = await db.request().query(
    `SELECT category name, MIN(category_sort) sort_order FROM om_faq
     WHERE category IS NOT NULL AND category <> N'' GROUP BY category ORDER BY 2, 1`);
  return f.recordset.map((x) => ({ name: String(x.name), sort_order: Number(x.sort_order), is_active: true }));
}

async function writeCats(rq: () => sql.Request, list: Cat[], userId: number | null) {
  const json = JSON.stringify(list.map((c, i) => ({ ...c, sort_order: c.sort_order ?? (i + 1) * 10 })));
  // ★ เลี่ยง MERGE (บั๊กที่รู้กัน) — UPDATE ก่อน ถ้าไม่โดนแถวค่อย INSERT
  const up = await rq().input("k", sql.NVarChar(80), KEY).input("v", sql.NVarChar(sql.MAX), json)
    .input("u", sql.Int, userId)
    .query(`UPDATE om_settings SET value_json = @v, updated_by = @u, updated_at = SYSDATETIMEOFFSET()
            WHERE [key] = @k COLLATE Latin1_General_BIN2`);
  if (up.rowsAffected[0] === 0)
    await rq().input("k", sql.NVarChar(80), KEY).input("v", sql.NVarChar(sql.MAX), json)
      .input("u", sql.Int, userId)
      .query(`INSERT INTO om_settings ([key], value_json, label_th, group_key, sort_order, updated_by)
              VALUES (@k, @v, N'หมวดคำถามที่พบบ่อย', 'faq', 10, @u)`);
}

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const db = await getOmDb();
  const [cats, used] = await Promise.all([
    readCats(db),
    db.request().query(`SELECT category name, COUNT(*) n FROM om_faq GROUP BY category`),
  ]);
  const count = new Map(used.recordset.map((x) => [String(x.name), Number(x.n)]));
  return NextResponse.json({
    categories: cats.sort((a, b) => a.sort_order - b.sort_order)
      .map((c) => ({ ...c, used_count: count.get(c.name) ?? 0 })),
  });
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const name = String((await req.json().catch(() => ({}))).name || "").trim();
  if (!name) return NextResponse.json({ error: "ต้องใส่ชื่อหมวด" }, { status: 400 });

  const db = await getOmDb();
  const cats = await readCats(db);
  if (cats.some((c) => c.name === name))
    return NextResponse.json({ error: "มีหมวดนี้อยู่แล้ว" }, { status: 409 });
  cats.push({ name, sort_order: Math.max(0, ...cats.map((c) => c.sort_order)) + 10, is_active: true });
  await writeCats(() => db.request(), cats, gate.userId ?? null);
  return NextResponse.json({ ok: true }, { status: 201 });
}

// PATCH { name, new_name?, sort_order?, is_active? }
// ★ เปลี่ยนชื่อหมวด = อัปเดตข้อความใน om_faq ตามไปด้วยในทรานแซกชันเดียว ไม่งั้น FAQ จะหลุดหมวด
export async function PATCH(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "ต้องระบุชื่อหมวด" }, { status: 400 });

  const db = await getOmDb();
  const cats = await readCats(db);
  const hit = cats.find((c) => c.name === name);
  if (!hit) return NextResponse.json({ error: "ไม่พบหมวด" }, { status: 404 });

  const newName = b.new_name === undefined ? null : String(b.new_name).trim();
  if (b.new_name !== undefined && !newName)
    return NextResponse.json({ error: "ชื่อหมวดห้ามว่าง" }, { status: 400 });
  if (newName && newName !== name && cats.some((c) => c.name === newName))
    return NextResponse.json({ error: "ชื่อหมวดซ้ำ" }, { status: 409 });

  if (newName) hit.name = newName;
  if (b.sort_order !== undefined) hit.sort_order = Number(b.sort_order);
  if (b.is_active !== undefined) hit.is_active = !!b.is_active;

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    await writeCats(() => new sql.Request(tx), cats, gate.userId ?? null);
    if (newName && newName !== name)
      await new sql.Request(tx).input("old", sql.NVarChar(60), name).input("new", sql.NVarChar(60), newName)
        .query(`UPDATE om_faq SET category = @new WHERE category = @old`);
    // ลำดับหมวดซ้ำไว้ที่แถว FAQ ด้วย เพื่อให้ ORDER BY ไม่ต้อง join อะไรเลย
    await new sql.Request(tx).input("n", sql.NVarChar(60), hit.name).input("s", sql.Int, hit.sort_order)
      .query(`UPDATE om_faq SET category_sort = @s WHERE category = @n`);
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE ?name= — ลบได้เฉพาะหมวดที่ไม่มี FAQ ใช้อยู่ (กันข้อมูลกำพร้า)
export async function DELETE(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const name = (req.nextUrl.searchParams.get("name") ?? "").trim();
  if (!name) return NextResponse.json({ error: "ต้องระบุชื่อหมวด" }, { status: 400 });

  const db = await getOmDb();
  const used = await db.request().input("n", sql.NVarChar(60), name)
    .query(`SELECT COUNT(*) n FROM om_faq WHERE category = @n`);
  if (used.recordset[0].n > 0)
    return NextResponse.json(
      { error: `ยังมี ${used.recordset[0].n} คำถามใช้หมวดนี้ — ย้ายหมวดก่อนจึงจะลบได้` }, { status: 409 });

  const cats = (await readCats(db)).filter((c) => c.name !== name);
  await writeCats(() => db.request(), cats, gate.userId ?? null);
  return NextResponse.json({ ok: true });
}
