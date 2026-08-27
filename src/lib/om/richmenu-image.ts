import "server-only";
import sharp from "sharp";

// ═══ เตรียมรูปพื้น Rich Menu ให้ผ่านเกณฑ์ LINE เสมอ ═══
// ยกวิธีจาก sena-ev (actions.ts → normalizeRichMenuImage)
// LINE บังคับ: ขนาดต้องตรงกับ size ของเมนู · ไฟล์ ≤1MB · JPEG หรือ PNG
// ⇒ ย่อ/ยืดให้ตรงขนาดก่อน แล้วลอง PNG · ถ้าเกิน 1MB ไล่ลดคุณภาพ JPEG จนผ่าน
//   (แทนที่จะปฏิเสธไฟล์ให้ผู้ใช้ไปย่อเอง)

export const LINE_RICHMENU_MAX_BYTES = 1024 * 1024;

export interface NormalizedImage {
  buf: Buffer;
  mime: "image/png" | "image/jpeg";
  width: number;
  height: number;
  originalBytes: number;
}

export async function normalizeRichMenuImage(
  input: Buffer,
  size: { width: number; height: number },
): Promise<NormalizedImage> {
  const base = sharp(input).resize(size.width, size.height, { fit: "fill" });

  const png = await base.clone().png({ compressionLevel: 9 }).toBuffer();
  if (png.byteLength <= LINE_RICHMENU_MAX_BYTES) {
    return { buf: png, mime: "image/png", width: size.width, height: size.height, originalBytes: input.byteLength };
  }

  // PNG ใหญ่เกิน → JPEG ไล่ลดคุณภาพ (พื้นขาวกันโปร่งใสกลายเป็นดำ)
  const toJpeg = (quality: number) =>
    base.clone().flatten({ background: "#ffffff" }).jpeg({ quality }).toBuffer();

  let out = await toJpeg(85);
  for (const quality of [75, 65, 55, 45, 35]) {
    if (out.byteLength <= LINE_RICHMENU_MAX_BYTES) break;
    out = await toJpeg(quality);
  }
  return { buf: out, mime: "image/jpeg", width: size.width, height: size.height, originalBytes: input.byteLength };
}
