// โมเดลสถานะงานบริการ O&M — ★ ผู้ใช้เคาะ 7 ก.ย. 69 (แผน 20260907_01 ข้อ 13)
//   6 สถานะเดินหน้าเดียว + 2 ทางออก · ทีมช่างเป็น "ฟิลด์" ไม่ใช่สถานะ (จ่ายทีมตอนไหนก็ได้)
//   follow = ยังไม่มีวันนัด (ถึงรอบ/กำลังโทร/ลูกค้าขอมา) — ไม่ขึ้นปฏิทิน
// ★ ชื่อชุดเดียวทุกหน้าจอ 24 ก.ย. 69 (แผน 20260924-02 เฟส 1) — เดิมสถานะเดียวมี 3 ชื่อ
//   (การ์ด "ทำนัด" · ใบงาน "รอยืนยัน" · แท็บ ...) ป้ายแท็บ/แถบขั้นใน service-view.ts ต้องตรงกับชุดนี้
export const BOOKING_STATUS = [
  { k: "follow",    t: "ติดตาม",      onCal: false, tone: "bg-gray-500" },
  // ★ เฟส 2 แผน 20260924-02: งานเสียเงินอยู่ขั้นนี้ระหว่างออกใบเสนอราคา/รออนุมัติ (ใบอยู่ตาราง quotations
  //   ผูกด้วย quotations.om_booking_id) · สีชมพู เพราะส้มเป็นของ "สิทธิ์หมด" ในหน้ารายการไปแล้ว
  { k: "quote",     t: "เสนอราคา",    onCal: false, tone: "bg-pink-600" },
  // ★ เฟส 4: ใบอนุมัติแล้ว Sale ส่งให้ลูกค้า → รอชำระ / รอ Account ยืนยัน / ชำระแล้วรอนัด (ขั้นย่อยอ่านจาก payments)
  //   "เก็บค่าบริการก่อนนัดหมาย" — ตกลงนัดได้ก็ต่อเมื่อ Account ยืนยันรับเงินแล้ว
  { k: "payment",   t: "ชำระเงิน",    onCal: false, tone: "bg-fuchsia-600" },
  { k: "pending",   t: "รอยืนยันนัด", onCal: true,  tone: "bg-amber-500" },
  { k: "confirmed", t: "นัดแล้ว",     onCal: true,  tone: "bg-blue-600" },
  { k: "progress",  t: "เข้างาน",     onCal: true,  tone: "bg-violet-600" },
  // ★ 28 ก.ย. 69: ไม่มีขั้นบนแถบ/แท็บแล้ว ปุ่มปิดงานไม่ผ่านสถานะนี้ — สงวนไว้ (ยืนยันทาง LINE / Q.C. ในอนาคต)
  { k: "checked",   t: "รอปิด",       onCal: true,  tone: "bg-teal-600" },
  { k: "closed",    t: "ปิดงาน",      onCal: true,  tone: "bg-emerald-600" },
] as const;
export const EXIT_STATUS = [
  { k: "cancelled", t: "ยกเลิก",             tone: "bg-red-500" },
  { k: "no_show",   t: "ลูกค้าไม่อยู่บ้าน", tone: "bg-rose-500" },
] as const;

export type BookingStatus = (typeof BOOKING_STATUS)[number]["k"] | (typeof EXIT_STATUS)[number]["k"];
export const ALL_STATUS: string[] = [...BOOKING_STATUS.map((s) => s.k), ...EXIT_STATUS.map((s) => s.k)];
// สถานะที่ยังนับเป็น "งานค้าง" — ใช้กันจองซ้ำประเภทเดียวกัน
export const ACTIVE_STATUS: string[] = ["follow", "quote", "payment", "pending", "confirmed", "progress", "checked"];

export const statusLabel = (k: string) =>
  [...BOOKING_STATUS, ...EXIT_STATUS].find((s) => s.k === k)?.t ?? k;
export const statusTone = (k: string) =>
  [...BOOKING_STATUS, ...EXIT_STATUS].find((s) => s.k === k)?.tone ?? "bg-gray-400";

// เดินหน้าได้ทีละขั้น ถอยหลังได้เฉพาะที่สมเหตุผล · ยกเลิก/ไม่อยู่บ้าน ทำได้ตลอดก่อนปิดงาน
const NEXT: Record<string, string[]> = {
  // ★ 1 ต.ค. 69 "ยืนยันและเข้างาน" = ตกลงวันกันในสายแล้ว ⇒ ติดตาม/ชำระแล้ว → นัดแล้ว ได้ตรง (ข้ามรอยืนยัน)
  follow:    ["quote", "pending", "confirmed", "cancelled"],
  // ★ 14 ต.ค. 69 (แผน 20261014-03): ออกจากเสนอราคาไปชำระเงินได้ทาง /api/om/quotations/[id]/send เท่านั้น
  //   (ตรวจอนุมัติครบทุกชุด + จดชุดที่ลูกค้าเลือก แล้วเขียนสถานะเอง ไม่ผ่านตารางนี้)
  //   เดิมมี payment / follow ให้ PATCH ใบงานย้ายตรง ๆ = ข้ามการอนุมัติ หรือถอยไปติดตามแล้วตกลงนัดโดยไม่จ่ายเงิน
  //   ไม่มีหน้าจอไหนใช้สองทางนั้น
  quote:     ["cancelled"],
  // payment → pending ผ่านการบันทึกโทร "ตกลงนัด" เท่านั้น และต้องรับเงินครบก่อน (ดู /api/om/follow)
  payment:   ["pending", "confirmed", "cancelled"],
  pending:   ["confirmed", "follow", "cancelled", "no_show"],
  confirmed: ["progress", "pending", "cancelled", "no_show"],
  // ★ 28 ก.ย. 69: เข้างาน → ปิดงานได้ตรง (ตัดขั้นรอปิดออกจากแถบ) · checked ยังรับไว้ให้ใบเก่า/LINE/Q.C. ในอนาคต
  progress:  ["closed", "checked", "confirmed", "cancelled", "no_show"],
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
  // ★ 21 ต.ค. 69 แผน 20261021-01: ชื่อเดียวกับปุ่ม "ตกลงรับบริการ" ในขั้น 01 (เดิม "รับสาย · ตกลงนัด")
  agreed:       { t: "ตกลงรับบริการ",      tone: "bg-emerald-600" },
  postponed:    { t: "ลูกค้าขอเลื่อน",     tone: "bg-amber-500" },
  no_answer:    { t: "ไม่รับสาย",          tone: "bg-gray-500" },
  declined:     { t: "ปฏิเสธไม่รับบริการ", tone: "bg-red-500" },   // 15 ต.ค. 69 ผู้ใช้สั่ง — ชุดเดียวกับปุ่มในขั้น 01 (CALL_ROWS)
  wrong_number: { t: "ข้อมูลติดต่อไม่ถูกต้อง", tone: "bg-rose-500" },   // เดิม "เบอร์ผิด" — ชื่อตามหน้าต่าง Follow-up ฝั่งขาย
  // ★ 1 ต.ค. 69 ปุ่ม Follow-up แบบหน้า lead (OmFollowupModal) — ติดต่อแล้วยังไม่มีข้อสรุป · จดประวัติอย่างเดียว ไม่ย้ายแท็บ
  informed:     { t: "แจ้งรอบล้างแผงแล้ว",   tone: "bg-emerald-500" },
  busy:         { t: "ลูกค้าขอให้ติดต่อภายหลัง", tone: "bg-amber-500" },
  other:        { t: "อื่น ๆ",               tone: "bg-gray-400" },
};

// ช่องทางติดต่อของบันทึกการติดตาม — ชุดเดียวกับ FOLLOW_UP_METHODS ของหน้า lead (ไม่มี SMS)
//   ไม่มีค่า = โทร (ประวัติก่อนมีปุ่ม Follow-up บันทึกจากฟอร์มโทรอย่างเดียว)
export const CONTACT_CHANNEL: Record<string, string> = { call: "โทร", visit: "ลงพื้นที่", line: "LINE", other: "อื่น ๆ" };
