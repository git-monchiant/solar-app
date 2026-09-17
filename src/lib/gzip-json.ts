import { gzipSync } from "zlib";
import { NextRequest, NextResponse } from "next/server";

// ตอบ JSON แบบ gzip สำหรับ endpoint ที่ payload ใหญ่ (/api/leads, /api/today ~1.3MB)
// — next dev ไม่บีบอัดให้ (compress ของ Next ทำงานเฉพาะ next start) ทีมที่ทดสอบ
// ผ่าน ngrok/มือถือเลยโหลด JSON เปลือยเต็มก้อน gzip แล้วเหลือ ~10% ของขนาดเดิม
// ฝั่ง client ไม่ต้องแก้อะไร fetch/browser คลาย gzip ให้เองตาม Content-Encoding
const MIN_GZIP_BYTES = 16 * 1024; // ก้อนเล็กไม่คุ้มค่า CPU — ตอบตรงๆ

export function gzipJson(req: NextRequest, data: unknown): NextResponse {
  const json = JSON.stringify(data);
  const acceptsGzip = (req.headers.get("accept-encoding") ?? "").includes("gzip");
  if (!acceptsGzip || Buffer.byteLength(json) < MIN_GZIP_BYTES) {
    return new NextResponse(json, {
      headers: { "content-type": "application/json" },
    });
  }
  const body = gzipSync(Buffer.from(json)) as unknown as BodyInit;
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json",
      "content-encoding": "gzip",
      // proxy/cache ต้องแยกตาม Accept-Encoding ไม่งั้นเสิร์ฟ gzip ให้คนที่รับไม่ได้
      vary: "Accept-Encoding",
    },
  });
}
