// ที่เก็บไฟล์เอกสารของโมดูล B2B (หลักฐานรับเงินงวด · เฟส 3) — ★ ฝั่ง server · อยู่ "นอก" public/ โดยตั้งใจ
// เหตุผลเดียวกับรูปหน้างาน O&M (src/lib/om/photo-store.ts): ทุกอย่างใต้ public/ Next เสิร์ฟตรงโดยไม่ผ่านการตรวจสิทธิ์
// เอกสารการเงินจึงต้องเข้าทาง route ที่ตรวจ role เท่านั้น · ในฐานเก็บ "ชื่อไฟล์" ไม่ใช่ URL
//
// ★ deploy: docker-compose ตอนนี้ mount แค่ ./uploads — ต้องตั้ง B2B_UPLOAD_DIR ชี้ volume ไม่งั้นไฟล์หายตอนสร้าง container ใหม่
import { mkdir, writeFile, unlink, stat } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

export const B2B_FILE_DIR = process.env.B2B_UPLOAD_DIR
  ? path.resolve(process.env.B2B_UPLOAD_DIR)
  : path.join(process.cwd(), "storage", "b2b-files");

export const MAX_B2B_FILE_BYTES = 15 * 1024 * 1024;
const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf",
};
export const ALLOWED_B2B_FILE_MIME = Object.keys(EXT);
const MIME_OF: Record<string, string> = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));
MIME_OF.jpeg = "image/jpeg";

/** ชื่อไฟล์ = b2b<โครงการ>_<ชนิด>_<เวลา>_<สุ่ม>.<นามสกุล> — สุ่มต่อท้ายกันชนกัน · ทุกส่วนผ่าน safe() กัน path traversal */
export function buildB2bFileName(projectId: number, kind: string, mime: string) {
  const safe = (s: string) => String(s).replace(/[^A-Za-z0-9_-]/g, "_");
  return `b2b${safe(String(projectId))}_${safe(kind)}_${Date.now()}_${randomBytes(3).toString("hex")}.${EXT[mime] ?? "bin"}`;
}

export const isSafeB2bName = (name: string) =>
  !!name && !name.includes("/") && !name.includes("\\") && !name.includes("..") && /^[A-Za-z0-9._-]+$/.test(name);

export const mimeOfB2bName = (name: string) => MIME_OF[path.extname(name).slice(1).toLowerCase()] ?? "application/octet-stream";

export async function saveB2bFile(name: string, buf: Buffer) {
  await mkdir(B2B_FILE_DIR, { recursive: true });
  await writeFile(path.join(B2B_FILE_DIR, name), buf);
}

export async function removeB2bFile(name: string | null | undefined) {
  if (!name || !isSafeB2bName(name)) return;
  await unlink(path.join(B2B_FILE_DIR, name)).catch(() => {});
}

export async function b2bFilePath(name: string | null | undefined) {
  if (!name || !isSafeB2bName(name)) return null;
  const p = path.join(B2B_FILE_DIR, name);
  try { await stat(p); } catch { return null; }
  return p;
}
