import crypto from "crypto";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// ขีดจำกัดตามสเปก LINE: รูป JPEG/PNG ≤10MB · วิดีโอ mp4 ≤200MB
// ฝั่งเราเก็บลง DB จึง cap วิดีโอที่ 50MB พอสำหรับคลิปหน้างาน — เกินนี้ควรบีบก่อนส่ง
export const MEDIA_RULES = {
  image: { mimes: ["image/jpeg", "image/png"], maxBytes: 10 * 1024 * 1024 },
  video: { mimes: ["video/mp4"], maxBytes: 50 * 1024 * 1024 },
} as const;

export function mediaKindOf(mime: string): "image" | "video" | null {
  if ((MEDIA_RULES.image.mimes as readonly string[]).includes(mime)) return "image";
  if ((MEDIA_RULES.video.mimes as readonly string[]).includes(mime)) return "video";
  return null;
}

export async function storeMedia(opts: {
  kind: "image" | "video";
  mime: string;
  buf: Buffer;
  source: "admin" | "line";
  createdBy?: number | null;
}): Promise<{ id: number; token: string }> {
  const token = crypto.randomBytes(20).toString("hex");
  const db = await getOmDb();
  // นโยบาย 24 ชม.: ลบไฟล์หมดอายุทิ้งทุกครั้งที่มีอัปโหลดใหม่ — ไม่ต้องมี job แยก
  // (แถวข้อความในแชตยังอยู่ แค่ไฟล์หาย → UI แสดง "หมดอายุ")
  await db.request().query(
    `DELETE FROM om_line_media WHERE created_at < DATEADD(hour, -24, SYSDATETIMEOFFSET())`);
  const r = await db.request()
    .input("token", sql.NVarChar(48), token)
    .input("kind", sql.NVarChar(10), opts.kind)
    .input("mime", sql.NVarChar(60), opts.mime)
    .input("bytes", sql.VarBinary(sql.MAX), opts.buf)
    .input("size", sql.Int, opts.buf.length)
    .input("source", sql.NVarChar(10), opts.source)
    .input("by", sql.Int, opts.createdBy ?? null)
    .query(`INSERT INTO om_line_media (token, kind, mime, bytes, size_bytes, source, created_by)
            OUTPUT INSERTED.id VALUES (@token, @kind, @mime, @bytes, @size, @source, @by)`);
  return { id: r.recordset[0].id, token };
}

// base URL สาธารณะที่ LINE เข้าถึงได้ (tunnel ตอน dev / โดเมนจริงตอน deploy)
// ไม่ตั้ง = ใช้ origin ของ request (พอสำหรับดูในแอปเอง แต่ LINE จะดึงไม่ได้ถ้าเป็น localhost)
export function publicBaseUrl(requestOrigin: string): string {
  return (process.env.OM_PUBLIC_BASE_URL || requestOrigin).replace(/\/$/, "");
}

export function mediaUrl(base: string, token: string): string {
  return `${base}/api/om/line/media/${token}`;
}
