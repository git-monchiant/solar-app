import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// เสิร์ฟไฟล์ media ให้ LINE และ inbox — ไม่มี auth เพราะเซิร์ฟเวอร์ LINE ต้องดึงได้
// ความปลอดภัยอยู่ที่ token สุ่ม 40 hex (เดาไม่ได้) · route นี้อ่านอย่างเดียว
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!/^[0-9a-f]{40}$/.test(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // นโยบายผู้ใช้ (26 ส.ค.): media เก็บ 24 ชม. — เกินนั้นลิงก์ตาย ลูกค้าต้องโหลดภายใน 24 ชม.
  const db = await getOmDb();
  const r = await db.request()
    .input("token", sql.NVarChar(48), token)
    .query(`SELECT mime, bytes,
                   CASE WHEN created_at < DATEADD(hour, -24, SYSDATETIMEOFFSET()) THEN 1 ELSE 0 END AS expired
            FROM om_line_media WHERE token = @token`);
  const row = r.recordset[0];
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.expired) return NextResponse.json({ error: "หมดอายุ (เก็บ 24 ชม.)" }, { status: 410 });

  return new NextResponse(new Uint8Array(row.bytes as Buffer), {
    headers: {
      "Content-Type": row.mime,
      // cache ได้ไม่เกินอายุที่เหลือ — ตั้งเพดาน 24 ชม. ไม่ใช้ immutable
      "Cache-Control": "public, max-age=86400",
    },
  });
}
