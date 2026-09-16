import type { Transaction } from "mssql";
import { sql } from "@/lib/db";

// บันทึกทุกการเปลี่ยนแปลงของนัด (ผู้ใช้เคาะ 31 ส.ค. ข้อ 4)
// ★ ต้องเรียกใน transaction เดียวกับการแก้ om_bookings เสมอ
//   ถ้าเขียนทีหลังนอก transaction จะมีเคสที่แก้สำเร็จแต่ log หาย

export type BookingAction =
  | "create" | "confirm" | "reschedule" | "assign_team" | "reorder"
  | "start" | "check" | "done" | "cancel" | "no_show"
  // ★ 10 ก.ย. 69: บันทึกการโทรใช้ตารางนี้ด้วย (ไม่มี om_call_log แยก)
  //   ตอนโทรครั้งแรกยังไม่มีใบงาน ⇒ booking_id ว่างได้ ผูกกับ house_id แทน
  | "call";

export type ActorRole = "admin" | "technician" | "customer" | "system";

export interface LogArgs {
  bookingId?: number | null;      // ว่างได้ = ยังไม่มีใบงาน (การ์ดติดตามคำนวณสด)
  houseId?: number | null;        // ต้องมีเมื่อ bookingId ว่าง
  action: BookingAction;
  actorUserId?: number | null;
  actorRole?: ActorRole;
  from?: Record<string, unknown> | null;   // ค่าเดิมเฉพาะฟิลด์ที่เปลี่ยน
  to?: Record<string, unknown> | null;     // ค่าใหม่
  reason?: string | null;
  nextActionDate?: string | null;   // นัดโทรใหม่ / นัดทำอะไรต่อ
}

/**
 * เขียนประวัติ 1 แถว — ต้องส่ง transaction ที่กำลังแก้ booking อยู่เข้ามา
 *
 *   const tx = new sql.Transaction(db); await tx.begin();
 *   await new sql.Request(tx).query(`UPDATE om_bookings ...`);
 *   await logBooking(tx, { bookingId, action: "reschedule", from, to, reason });
 *   await tx.commit();
 */
export async function logBooking(tx: Transaction, a: LogArgs): Promise<void> {
  if (a.bookingId == null && a.houseId == null)
    throw new Error("logBooking: ต้องมี bookingId หรือ houseId อย่างน้อยหนึ่งอย่าง");
  await new sql.Request(tx)
    .input("b", sql.Int, a.bookingId ?? null)
    .input("h", sql.Int, a.houseId ?? null)
    .input("nd", sql.Date, a.nextActionDate ?? null)
    .input("act", sql.VarChar(20), a.action)
    .input("uid", sql.Int, a.actorUserId ?? null)
    .input("role", sql.VarChar(20), a.actorRole ?? "admin")
    .input("f", sql.NVarChar(sql.MAX), a.from ? JSON.stringify(a.from) : null)
    .input("t", sql.NVarChar(sql.MAX), a.to ? JSON.stringify(a.to) : null)
    .input("r", sql.NVarChar(300), a.reason ?? null)
    .query(`INSERT INTO om_booking_history
              (booking_id, house_id, [action], actor_user_id, actor_role,
               from_json, to_json, reason, next_action_date)
            VALUES (@b, @h, @act, @uid, @role, @f, @t, @r, @nd)`);
}

const LABEL: Record<BookingAction, string> = {
  create: "สร้างนัด", confirm: "ยืนยันนัด", reschedule: "เลื่อนนัด",
  assign_team: "จ่ายทีมช่าง", reorder: "สลับลำดับคิว", start: "เริ่มงาน",
  check: "ตรวจงานเสร็จ รอปิด", done: "ปิดงาน", cancel: "ยกเลิกนัด", no_show: "ลูกค้าไม่อยู่บ้าน",
  call: "บันทึกการโทร",
};

export const actionLabel = (a: string): string => LABEL[a as BookingAction] ?? a;
