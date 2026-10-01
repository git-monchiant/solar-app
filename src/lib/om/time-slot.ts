// ช่วงเวลาที่จองของใบงาน O&M — แผน 20261001-01 เฟส 1
// ★ ทีมสำรวจกับทีมล้างเป็นชุดเดียวกัน (ผู้ใช้เคาะ 1 ต.ค. 69) ⇒ เก็บแบบนัดสำรวจของฝั่งขาย
//   om_bookings.time_slot = JSON array ของช่อง 30 นาที (HOURLY_SLOTS) เหมือน leads.survey_time_slot
//   scheduled_at = วันนัด + เวลาเริ่มของช่องแรก (คงไว้ให้การเรียง/งานวันนี้/cron/PDF ใช้ต่อ)
// ★ server เป็นคนคำนวณ scheduled_at จากช่องที่เลือก — ไม่เชื่อเวลาที่ client ส่งมาเมื่อมี time_slot
import { sql } from "@/lib/db";
import { HOURLY_SLOTS, parseSlots, serializeSlots } from "@/lib/time-slots";

const SLOTS: readonly string[] = HOURLY_SLOTS;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toHm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** วันเวลาที่มี offset/Z → "YYYY-MM-DDTHH:mm" เวลาไทย · ไม่มี offset = ถือว่าเป็นเวลาไทยอยู่แล้ว คืนตามเดิม */
export function thaiLocal(s: string): string {
  if (!/[+-]\d{2}:\d{2}$|Z$/.test(s)) return s;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? s : new Date(t + 7 * 3600000).toISOString().slice(0, 16);
}

/** time_slot ที่ client ส่งมา (array หรือ JSON string) → ช่องที่ถูกต้อง เรียง ไม่ซ้ำ · ไม่ได้ส่งมา = null */
export function cleanSlots(raw: unknown): { slots: string[] } | { error: string } | null {
  if (raw == null || raw === "") return null;
  const list = Array.isArray(raw) ? raw.map(String) : parseSlots(String(raw));
  const slots = [...new Set(list)].sort();
  if (!slots.length) return { error: "เลือกช่วงเวลาอย่างน้อย 1 ช่อง" };
  const bad = slots.filter((s) => !SLOTS.includes(s));
  if (bad.length) return { error: `ช่วงเวลาไม่ถูกต้อง: ${bad.join(", ")}` };
  return { slots };
}

/**
 * หน้าจอเก่ายังส่งแค่เวลาเริ่ม — คำนวณช่องจากเวลาเริ่ม ตามช่วงใน om_slot_config ที่ครอบเวลานั้นอยู่
 * กติกาเดียวกับ backfill ใน scripts/migrations-v3/20261001-1400_om_booking_time_slot.sql
 *   เวลาเริ่มปัดลงเป็น :00/:30 → ไล่ช่องจนจบช่วงนั้น · ไม่อยู่ในช่วงไหน = ช่องเดียว · นอก 09:00–16:30 = ไม่มีช่อง
 */
export async function slotsFromStart(conn: sql.ConnectionPool | sql.Transaction, hm: string): Promise<string[]> {
  const t = toMin(hm);
  const f = t - (t % 30);
  const req = conn instanceof sql.Transaction ? new sql.Request(conn) : new sql.Request(conn);
  const r = await req.input("t", sql.VarChar(5), hm)
    .query(`SELECT TOP 1 CONVERT(char(5), end_time, 108) e FROM om_slot_config
             WHERE start_time <= CAST(@t AS time) AND CAST(@t AS time) < end_time ORDER BY end_time`);
  const end = r.recordset[0]?.e ? toMin(String(r.recordset[0].e)) : f + 30;
  return SLOTS.filter((s) => toMin(s) >= f && toMin(s) < end);
}

/**
 * ย้ายวันเวลานัดโดยไม่ได้เลือกช่องใหม่ (เช่นลากในปฏิทิน O&M) — คงจำนวน/รูปช่องเดิม เลื่อนตามเวลาเริ่มใหม่
 * ช่องที่หลุดช่วง 09:00–16:30 ตัดทิ้ง · ไม่เหลือเลยหรือใบเดิมไม่มีช่อง = คำนวณจากเวลาเริ่มแบบ slotsFromStart
 */
export async function shiftSlots(conn: sql.ConnectionPool | sql.Transaction, prev: string | null, hm: string): Promise<string[]> {
  const old = parseSlots(prev).filter((s) => SLOTS.includes(s)).sort();
  if (old.length) {
    const d = toMin(hm) - (toMin(hm) % 30) - toMin(old[0]);
    const moved = old.map((s) => toHm(toMin(s) + d)).filter((s) => SLOTS.includes(s));
    if (moved.length) return moved;
  }
  return slotsFromStart(conn, hm);
}

/**
 * ค่าที่จะเขียนลง om_bookings ตอนตกลงนัด/เลื่อนนัด
 *   scheduledAt = "YYYY-MM-DD" หรือ "YYYY-MM-DDTHH:mm" (ใช้วันเสมอ · ใช้เวลาเฉพาะตอนไม่ส่ง time_slot)
 *   timeSlot    = ช่องที่เลือก (array / JSON) — ไม่ส่ง = หน้าจอเก่า คำนวณจากเวลาเริ่ม
 * คืน at = "YYYY-MM-DDTHH:mm" (ส่งต่อให้ toThaiOffset) · slot = JSON ที่เก็บ (null = ไม่มีช่องให้)
 */
export async function omSlotsFor(conn: sql.ConnectionPool | sql.Transaction, scheduledAt: unknown, timeSlot: unknown):
  Promise<{ at: string; slot: string | null } | { error: string }> {
  const s = typeof scheduledAt === "string" ? thaiLocal(scheduledAt.trim()) : "";
  const date = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "ต้องระบุวันนัด" };
  const picked = cleanSlots(timeSlot);
  if (picked && "error" in picked) return picked;
  if (picked) return { at: `${date}T${picked.slots[0]}`, slot: serializeSlots(picked.slots) };
  const hm = s.slice(11, 16);
  if (!/^\d{2}:\d{2}$/.test(hm)) return { error: "ต้องระบุช่วงเวลา" };
  return { at: `${date}T${hm}`, slot: serializeSlots(await slotsFromStart(conn, hm)) };
}
