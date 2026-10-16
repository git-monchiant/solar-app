import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { normalizeRichMenuImage } from "@/lib/om/richmenu-image";

// GET — รูปพื้นเมนูของเวอร์ชันนี้ (ใช้แสดงในหน้า designer)
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = await getOmDb();
  const r = await db.request().input("id", sql.Int, Number(id))
    .query(`SELECT image_blob, image_mime FROM om_richmenu_versions WHERE id = @id`);
  const row = r.recordset[0];
  if (!row?.image_blob) return NextResponse.json({ error: "ยังไม่มีรูป" }, { status: 404 });

  return new NextResponse(new Uint8Array(row.image_blob as Buffer), {
    headers: { "Content-Type": row.image_mime || "image/png", "Cache-Control": "no-store" },
  });
}

// POST multipart { file } — อัปโหลดรูปพื้นเมนูให้เวอร์ชันร่าง
// ★ อัปเปลี่ยนได้เฉพาะตอนยังเป็น draft — เผยแพร่ไปแล้ว LINE ไม่ให้แทนที่รูป ต้องสร้างเวอร์ชันใหม่
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const { id } = await ctx.params;

  const db = await getOmDb();
  const cur = await db.request().input("id", sql.Int, Number(id))
    .query(`SELECT status, layout FROM om_richmenu_versions WHERE id = @id`);
  if (!cur.recordset[0]) return NextResponse.json({ error: "ไม่พบเวอร์ชัน" }, { status: 404 });
  if (cur.recordset[0].status !== "draft") {
    return NextResponse.json(
      { error: "เวอร์ชันที่เผยแพร่แล้วเปลี่ยนรูปไม่ได้ (ข้อจำกัดของ LINE) — สร้างเวอร์ชันใหม่แทน" },
      { status: 409 },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "ต้องแนบไฟล์ (field: file)" }, { status: 400 });
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "ต้องเป็นไฟล์รูปภาพ" }, { status: 400 });
  }

  // ขนาดของเมนูมาจาก layout ที่บันทึกไว้ (เทมเพลตใหญ่ 2500x1686 / เล็ก 2500x843)
  let size = { width: 2500, height: 1686 };
  try {
    const parsed = JSON.parse(cur.recordset[0].layout).size;
    if (parsed?.width && parsed?.height) size = parsed;
  } catch { /* ใช้ค่าตั้งต้น */ }

  // ★ ไม่ปฏิเสธไฟล์ใหญ่ — ย่อให้ตรงขนาด + บีบให้ ≤1MB ให้เอง (ยกวิธีจาก sena-ev)
  const img = await normalizeRichMenuImage(Buffer.from(await file.arrayBuffer()), size);

  await db.request()
    .input("id", sql.Int, Number(id))
    .input("blob", sql.VarBinary(sql.MAX), img.buf)
    .input("mime", sql.NVarChar(40), img.mime)
    .query(`UPDATE om_richmenu_versions SET image_blob = @blob, image_mime = @mime WHERE id = @id`);

  return NextResponse.json({
    ok: true,
    size: img.buf.length,
    mime: img.mime,
    dimensions: `${img.width}×${img.height}`,
    note: img.originalBytes === img.buf.length
      ? undefined
      : `ปรับรูปให้ ${img.width}×${img.height} · บีบจาก ${Math.round(img.originalBytes / 1024)}KB เหลือ ${Math.round(img.buf.length / 1024)}KB`,
  });
}
