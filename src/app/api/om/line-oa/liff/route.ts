import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// ทะเบียน LIFF app — เก็บ liff_id ที่ได้จาก LINE Developers Console ไว้ใช้สร้างลิงก์ในเมนู/ข้อความ
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const db = await getOmDb();
  const r = await db.request().query(
    `SELECT id, code, name, liff_id, endpoint_path, external_url, view_size, is_active, note, updated_at
     FROM om_liff_apps ORDER BY id`);
  return NextResponse.json({ apps: fixDates(r.recordset) });
}

// PATCH { id, liff_id?, name?, endpoint_path?, external_url?, view_size?, is_active?, note? }
export async function PATCH(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });

  // liff_id ล้างค่าได้ (ส่ง "" มา) — ฟิลด์อื่นไม่ส่ง = ไม่แตะ
  const setLiff = Object.prototype.hasOwnProperty.call(b, "liff_id");
  // ★ external_url = ลิงก์ออกนอก LINE (เช่น referral → หน้าสมัคร agent) · ล้างค่าได้ด้วยการส่ง ""
  const setUrl = Object.prototype.hasOwnProperty.call(b, "external_url");
  const url = setUrl ? String(b.external_url).trim() : "";
  if (url && !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://" }, { status: 400 });
  }
  const db = await getOmDb();
  await db.request()
    .input("id", sql.Int, Number(b.id))
    .input("setLiff", sql.Bit, setLiff ? 1 : 0)
    .input("liff", sql.NVarChar(60), setLiff ? (String(b.liff_id).trim() || null) : null)
    .input("setUrl", sql.Bit, setUrl ? 1 : 0)
    .input("url", sql.NVarChar(500), url || null)
    .input("name", sql.NVarChar(120), b.name ?? null)
    .input("path", sql.NVarChar(200), b.endpoint_path ?? null)
    .input("size", sql.NVarChar(10), b.view_size ?? null)
    .input("act", sql.Bit, b.is_active === undefined ? null : (b.is_active ? 1 : 0))
    .input("note", sql.NVarChar(400), b.note ?? null)
    .query(`UPDATE om_liff_apps SET
              liff_id       = CASE WHEN @setLiff = 1 THEN @liff ELSE liff_id END,
              external_url  = CASE WHEN @setUrl = 1 THEN @url ELSE external_url END,
              name          = COALESCE(@name, name),
              endpoint_path = COALESCE(@path, endpoint_path),
              view_size     = COALESCE(@size, view_size),
              is_active     = COALESCE(@act, is_active),
              note          = COALESCE(@note, note),
              updated_at    = SYSDATETIMEOFFSET()
            WHERE id = @id`);

  return NextResponse.json({ ok: true });
}
