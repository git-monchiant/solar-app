import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { requireAuth } from "@/lib/auth";
import { authenticateLiff } from "@/lib/om/liff-auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { isSafeName, mimeOfName, parsePhotos, photoPath } from "@/lib/om/photo-store";

// เสิร์ฟรูปหน้างาน — ★ ทางเข้าเดียวของไฟล์เหล่านี้ (ไฟล์อยู่นอก public/ Next จึงเสิร์ฟตรงไม่ได้)
// สิทธิ์: ผู้ใช้ระบบ (แอดมิน/ช่าง) หรือ ลูกค้า LIFF ที่บ้านของเขาผูกกับใบงานนี้เท่านั้น
// ★ booking id อยู่ใน URL เพื่อให้ตรวจความเป็นเจ้าของได้ตรง ๆ โดยไม่ต้องไล่หาว่าไฟล์นี้ของใคร

async function allowed(req: NextRequest, bookingId: number, file: string) {
  const db = await getOmDb();
  // รูปต้องอยู่ในรายการของใบงานนี้จริง — กันเอา id ใบงานที่ตัวเองดูได้ ไปเปิดไฟล์ของใบอื่น
  const r = await db.request().input("id", sql.Int, bookingId)
    .query(`SELECT r.photos, b.house_id FROM om_bookings b
              LEFT JOIN om_job_report r ON r.booking_id = b.id
             WHERE b.id = @id`);
  const row = r.recordset[0];
  if (!row || !parsePhotos(row.photos).some((p) => p.file === file)) return false;

  // ผู้ใช้ระบบผ่านได้เลย
  const gate = await requireAuth(req);
  if (!gate.error) return true;

  // ลูกค้า LIFF — ต้องเป็นเจ้าของบ้านของใบงานนี้
  const auth = await authenticateLiff(req).catch(() => null);
  if (!auth || auth.denied) return false;
  const own = await db.request()
    .input("u", sql.NVarChar(64), auth.identity.lineUserId)
    .input("h", sql.Int, row.house_id)
    .query(`SELECT TOP 1 1 ok FROM om_line_user_houses WHERE line_user_id = @u AND house_id = @h`);
  return own.recordset.length > 0;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await ctx.params;
  const bookingId = Number(id);
  if (!bookingId || !isSafeName(file))
    return NextResponse.json({ error: "คำขอไม่ถูกต้อง" }, { status: 400 });

  if (!(await allowed(req, bookingId, file)))
    return NextResponse.json({ error: "ไม่มีสิทธิ์ดูรูปนี้" }, { status: 403 });

  const p = await photoPath(file);
  // ★ 404 ห้ามถูก cache — ไฟล์ที่ยังไม่มาแล้วมาทีหลังจะโดนจำว่าไม่มีอยู่เป็นชั่วโมง
  if (!p) return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 404, headers: { "Cache-Control": "no-store" } });

  const buf = await readFile(p);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": mimeOfName(file),
      // private = ห้าม CDN/proxy เก็บไว้แจกต่อ (รูปนี้ผ่านการตรวจสิทธิ์รายคน)
      "Cache-Control": "private, max-age=3600",
    },
  });
}
