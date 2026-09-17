// ที่เก็บรูปหน้างาน O&M — ★ อยู่ "นอก" public/ โดยตั้งใจ
//
// ★★ เหตุผล (วัดของจริงแล้ว 16 ก.ย. 69): Next เสิร์ฟทุกอย่างใต้ public/ ตรง ๆ
//    ทดลองวางไฟล์ใน public/uploads แล้วยิงโดยไม่มี header ล็อกอินเลย → 200 ได้เนื้อไฟล์เต็ม
//    ทั้งทาง /uploads/<ชื่อ> และ /api/files/<ชื่อ> ⇒ การใส่ auth ที่ route ไร้ความหมาย
//    รูปหน้างานคือรูปบ้านลูกค้าพร้อมที่อยู่ จึงต้องอยู่นอก public/ แล้วเข้าทาง route ที่ตรวจสิทธิ์เท่านั้น
//
// ★ ในฐานเก็บ "ชื่อไฟล์" ไม่ใช่ URL เต็ม ⇒ วันหลังย้ายไป S3 หรือทำลิงก์หมดอายุ
//   แก้แค่ route ที่เสิร์ฟ ไม่ต้องแตะข้อมูลสักแถว
import { mkdir, writeFile, unlink, stat } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

/** โฟลเดอร์เก็บรูป — ตั้งทับได้ด้วย OM_UPLOAD_DIR (เช่น ชี้ไป volume แยกตอน deploy) */
export const PHOTO_DIR = process.env.OM_UPLOAD_DIR
  ? path.resolve(process.env.OM_UPLOAD_DIR)
  : path.join(process.cwd(), "storage", "om-photos");

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024; // 15 MB — รูปจากมือถือใบละ ~3-8 MB
export const ALLOWED_PHOTO_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic"];

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic",
};
const MIME_OF: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic",
};

/** 1 รูปในใบตรวจ — เก็บเป็น JSON array ในคอลัมน์ om_job_report.photos */
export type JobPhoto = {
  file: string;        // ชื่อไฟล์เปล่า ๆ ไม่ใช่ URL
  kind: string;        // before | after
  at: string;          // เวลาอัปโหลด +07:00
  by: number | null;   // ผู้ใช้ที่อัปโหลด
  size: number;
};

export const PHOTO_KINDS = ["before", "after"] as const;
export const isPhotoKind = (k: unknown): k is (typeof PHOTO_KINDS)[number] =>
  typeof k === "string" && (PHOTO_KINDS as readonly string[]).includes(k);

/**
 * ชื่อไฟล์ = om<ใบงาน>_<kind>_<เวลา>_<สุ่ม6หลัก>.<นามสกุล>
 * ★ สุ่มต่อท้ายเสมอ กันสองรูปที่อัปในมิลลิวินาทีเดียวกันทับกัน และกัน cache จำรูปเก่า
 * ★ ทุกส่วนผ่าน safe() — ชื่อไฟล์ห้ามมี / หรือ .. เด็ดขาด (path traversal)
 */
export function buildPhotoName(bookingId: number, kind: string, mime: string) {
  const safe = (s: string) => String(s).replace(/[^A-Za-z0-9_-]/g, "_");
  const ext = EXT[mime] ?? "jpg";
  return `om${safe(String(bookingId))}_${safe(kind)}_${Date.now()}_${randomBytes(3).toString("hex")}.${ext}`;
}

/** กันชื่อไฟล์ที่พาออกนอกโฟลเดอร์ — ต้องเรียกก่อนแตะดิสก์ทุกครั้ง */
export const isSafeName = (name: string) =>
  !!name && !name.includes("/") && !name.includes("\\") && !name.includes("..") && /^[A-Za-z0-9._-]+$/.test(name);

export const mimeOfName = (name: string) =>
  MIME_OF[path.extname(name).slice(1).toLowerCase()] ?? "application/octet-stream";

export async function savePhoto(name: string, buf: Buffer) {
  await mkdir(PHOTO_DIR, { recursive: true });
  await writeFile(path.join(PHOTO_DIR, name), buf);
}

export async function removePhoto(name: string) {
  if (!isSafeName(name)) return;
  await unlink(path.join(PHOTO_DIR, name)).catch(() => {});
}

export async function photoPath(name: string) {
  if (!isSafeName(name)) return null;
  const p = path.join(PHOTO_DIR, name);
  try { await stat(p); } catch { return null; }
  return p;
}

/** อ่าน photos จาก JSON ในฐานแบบไม่ล้ม ต่อให้ข้อมูลเก่าเป็นรูปแบบอื่น */
export function parsePhotos(raw: unknown): JobPhoto[] {
  if (!raw) return [];
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? (v.filter((x) => x && typeof x.file === "string") as JobPhoto[]) : [];
  } catch { return []; }
}
