// โมเดลสถานะงานบริการ O&M — ★ ผู้ใช้เคาะ 7 ก.ย. 69 (แผน 20260907_01 ข้อ 13)
//   6 สถานะเดินหน้าเดียว + 2 ทางออก · ทีมช่างเป็น "ฟิลด์" ไม่ใช่สถานะ (จ่ายทีมตอนไหนก็ได้)
//   follow = ยังไม่มีวันนัด (ถึงรอบ/กำลังโทร/ลูกค้าขอมา) — ไม่ขึ้นปฏิทิน
export const BOOKING_STATUS = [
  { k: "follow",    t: "ติดตาม",     onCal: false, tone: "bg-gray-500" },
  { k: "pending",   t: "รอยืนยัน",   onCal: true,  tone: "bg-amber-500" },
  { k: "confirmed", t: "ยืนยันแล้ว", onCal: true,  tone: "bg-blue-600" },
  { k: "progress",  t: "กำลังทำ",    onCal: true,  tone: "bg-violet-600" },
  { k: "checked",   t: "รอปิดงาน",   onCal: true,  tone: "bg-teal-600" },
  { k: "closed",    t: "ปิดงาน",     onCal: true,  tone: "bg-emerald-600" },
] as const;
export const EXIT_STATUS = [
  { k: "cancelled", t: "ยกเลิก",             tone: "bg-red-500" },
  { k: "no_show",   t: "ลูกค้าไม่อยู่บ้าน", tone: "bg-rose-500" },
] as const;

export type BookingStatus = (typeof BOOKING_STATUS)[number]["k"] | (typeof EXIT_STATUS)[number]["k"];
export const ALL_STATUS: string[] = [...BOOKING_STATUS.map((s) => s.k), ...EXIT_STATUS.map((s) => s.k)];
// สถานะที่ยังนับเป็น "งานค้าง" — ใช้กันจองซ้ำประเภทเดียวกัน
export const ACTIVE_STATUS: string[] = ["follow", "pending", "confirmed", "progress", "checked"];

export const statusLabel = (k: string) =>
  [...BOOKING_STATUS, ...EXIT_STATUS].find((s) => s.k === k)?.t ?? k;
export const statusTone = (k: string) =>
  [...BOOKING_STATUS, ...EXIT_STATUS].find((s) => s.k === k)?.tone ?? "bg-gray-400";

// เดินหน้าได้ทีละขั้น ถอยหลังได้เฉพาะที่สมเหตุผล · ยกเลิก/ไม่อยู่บ้าน ทำได้ตลอดก่อนปิดงาน
const NEXT: Record<string, string[]> = {
  follow:    ["pending", "cancelled"],
  pending:   ["confirmed", "follow", "cancelled", "no_show"],
  confirmed: ["progress", "pending", "cancelled", "no_show"],
  progress:  ["checked", "confirmed", "cancelled", "no_show"],
  checked:   ["closed", "progress"],
  closed:    [],
  cancelled: ["follow"],
  no_show:   ["follow", "pending"],
};
export const canMove = (from: string, to: string) => (NEXT[from] ?? []).includes(to);
export const nextOf = (from: string) => NEXT[from] ?? [];

// เวลาไทยชัดเจนเสมอ (กติกาโปรเจกต์) — รับ "2026-09-10T09:00" จากฟอร์มแล้วเติม +07:00
export function toThaiOffset(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = String(s).trim();
  if (/[+-]\d{2}:\d{2}$|Z$/.test(t)) return t;
  return `${t.length === 16 ? `${t}:00` : t}+07:00`;
}

// ผลการโทร — ★ อยู่ที่ไฟล์นี้เพราะเป็นค่าคงที่ล้วน ฝั่ง client import ได้
//   (booking-log.ts ดึง mssql เข้ามา ใช้ในไฟล์ "use client" ไม่ได้)
export const CALL_OUTCOME: Record<string, { t: string; tone: string }> = {
  agreed:       { t: "รับสาย · ตกลงนัด",   tone: "bg-emerald-600" },
  postponed:    { t: "รับสาย · ขอเลื่อน",  tone: "bg-amber-500" },
  no_answer:    { t: "ไม่รับสาย",          tone: "bg-gray-500" },
  declined:     { t: "ปฏิเสธ ไม่เอา",      tone: "bg-red-500" },
  wrong_number: { t: "เบอร์ผิด",           tone: "bg-rose-500" },
};
