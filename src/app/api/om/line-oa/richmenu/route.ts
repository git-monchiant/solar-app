import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { validateLayout, type RichMenuLayout } from "@/lib/om/richmenu";

// GET — รายการเวอร์ชันทั้งหมด (ใหม่ก่อน) ของ audience หนึ่ง
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const audience = req.nextUrl.searchParams.get("audience") || "verified";

  const db = await getOmDb();
  const r = await db.request()
    .input("aud", sql.NVarChar(20), audience)
    .query(`SELECT v.id, v.version_no, v.name, v.audience, v.chat_bar_text, v.layout, v.status,
                   v.rich_menu_id, v.note, v.created_at, v.deployed_at,
                   CASE WHEN v.image_blob IS NULL THEN 0 ELSE 1 END AS has_image,
                   u.full_name AS created_by_name
            FROM om_richmenu_versions v
            LEFT JOIN users u ON u.id = v.created_by
            WHERE v.audience = @aud
            ORDER BY v.version_no DESC`);

  return NextResponse.json({ versions: fixDates(r.recordset) });
}

// POST — บันทึกเป็นเวอร์ชันใหม่ (ร่าง) · แก้เวอร์ชันเดิมไม่ได้เพราะ LINE ไม่ให้แก้เมนูที่สร้างแล้ว
export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const audience = String(body.audience || "verified");
  const name = String(body.name || "").trim();
  const chatBarText = String(body.chat_bar_text || "เมนู").slice(0, 14);
  const layout = body.layout as RichMenuLayout;

  if (!name) return NextResponse.json({ error: "ต้องตั้งชื่อเวอร์ชัน" }, { status: 400 });
  const invalid = validateLayout(layout);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const db = await getOmDb();
  const next = await db.request().input("aud", sql.NVarChar(20), audience)
    .query(`SELECT ISNULL(MAX(version_no), 0) + 1 AS n FROM om_richmenu_versions WHERE audience = @aud`);

  // เวอร์ชันใหม่สืบทอดรูปจากเวอร์ชันล่าสุด ถ้ายังไม่อัปโหลดรูปใหม่ (แก้แค่ปุ่มก็ไม่ต้องอัปรูปซ้ำ)
  const r = await db.request()
    .input("no", sql.Int, next.recordset[0].n)
    .input("name", sql.NVarChar(120), name)
    .input("aud", sql.NVarChar(20), audience)
    .input("bar", sql.NVarChar(14), chatBarText)
    .input("layout", sql.NVarChar(sql.MAX), JSON.stringify(layout))
    .input("note", sql.NVarChar(400), body.note ? String(body.note) : null)
    .input("by", sql.Int, gate.userId)
    .query(`INSERT INTO om_richmenu_versions
              (version_no, name, audience, chat_bar_text, layout, note, created_by, image_blob, image_mime)
            OUTPUT INSERTED.id, INSERTED.version_no
            SELECT @no, @name, @aud, @bar, @layout, @note, @by,
                   (SELECT TOP 1 image_blob FROM om_richmenu_versions WHERE audience = @aud AND image_blob IS NOT NULL ORDER BY version_no DESC),
                   (SELECT TOP 1 image_mime FROM om_richmenu_versions WHERE audience = @aud AND image_blob IS NOT NULL ORDER BY version_no DESC)`);

  return NextResponse.json({ ok: true, ...r.recordset[0] }, { status: 201 });
}
