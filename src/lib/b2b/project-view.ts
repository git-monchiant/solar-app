import type { B2bActivity, B2bProject } from "./project";
import type { QuoteStatus } from "./quotation";

// ตัวช่วยของหน้าโครงการแบบแถบขั้น + การ์ดขั้นต่อไป (แผน 20261016-01) — คิดจาก timeline ที่ server จดไว้ ไม่มีคอลัมน์เพิ่ม
// ไม่มี mssql ⇒ client import ได้ · activities เรียงใหม่ก่อน (ORDER BY created_at DESC ใน loadProject)

/** แถว timeline ที่เป็นการเปลี่ยนขั้น (นัดสำรวจซ้ำจด from = to — ไม่นับ) */
const isMove = (a: B2bActivity) => a.to_stage != null && a.from_stage !== a.to_stage;

/** เวลาที่เข้าขั้นปัจจุบัน = การเปลี่ยนขั้นครั้งล่าสุดที่จบที่ขั้นนี้ · หาไม่เจอใช้วันสร้างโครงการ */
export function stageEnteredAt(p: B2bProject): string {
  return p.activities.find((a) => isMove(a) && a.to_stage === p.stage)?.created_at ?? p.created_at;
}

/** วันที่ผ่านขั้นนี้ไป = เดินหน้าครั้งล่าสุดจากขั้นนี้ (หรือขั้นก่อนหน้า) ไปขั้นหลัง · ถอยขั้นไม่นับ */
export function stepPassedAt(p: B2bProject, step: number): string | null {
  return p.activities.find((a) => isMove(a) && a.from_stage != null && a.from_stage <= step && a.to_stage! > step)?.created_at ?? null;
}

/** ขั้นที่ไม่เคยเข้าเลย — ข้ามไปนัดสำรวจ (ข้าม 02) · ข้ามสำรวจ (ข้าม 03) */
export const stepSkipped = (p: B2bProject, step: number) => !p.activities.some((a) => isMove(a) && a.to_stage === step);

/** จำนวนวันตามปฏิทินไทยนับจาก iso ถึง now (0 = วันนี้) */
export function daysSince(iso: string, now: number): number {
  const day = (t: number) => Math.floor((t + 7 * 3_600_000) / 86_400_000);
  return Math.max(0, day(now) - day(new Date(iso).getTime()));
}
/** อยู่ขั้นเดิมเกินกี่วันให้ตัวเลขเป็นสีเตือน (เสนอไว้ในแผน — ปรับรายขั้นได้ทีหลัง) */
export const STAGE_AGING_WARN_DAYS = 14;

/** ผู้ตรวจสอบอนุมัติผ่านแล้วกี่ชั้น (0–3) */
export function reviewedTiers(s: QuoteStatus): number {
  if (s === "pending_review2") return 1;
  if (s === "pending_review3") return 2;
  return s === "approved" || s === "sent" || s === "won" ? 3 : 0;
}
