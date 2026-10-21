import type { Transaction } from "mssql";
import { sql } from "@/lib/db";

// บันทึกทุกการเปลี่ยนแปลงของนัด (ผู้ใช้เคาะ 31 ส.ค. ข้อ 4)
// ★ ต้องเรียกใน transaction เดียวกับการแก้ om_bookings เสมอ
//   ถ้าเขียนทีหลังนอก transaction จะมีเคสที่แก้สำเร็จแต่ log หาย

export type BookingAction =
  | "create" | "confirm" | "reschedule" | "assign_team" | "reorder"
  | "start" | "check" | "done" | "cancel" | "no_show"
  // ★ 24 ก.ย. 69 (เฟส 4): เจ้าของเคส — คนละอย่างกับ assign_team (ทีมช่างที่ไปหน้างาน)
  | "assign_owner"
  // ★ 10 ก.ย. 69: บันทึกการโทรใช้ตารางนี้ด้วย (ไม่มี om_call_log แยก)
  //   ตอนโทรครั้งแรกยังไม่มีใบงาน ⇒ booking_id ว่างได้ ผูกกับ house_id แทน
  | "call"
  // ★ 24 ก.ย. 69 แผน 20260924-02 เฟส 2: ใบเสนอราคาของงานเสียเงิน
  | "quote" | "quote_edit"
  // ★ 2 ต.ค. 69 (แผน 20261002-02): ใบเสนอราคาได้ 3 ชุด — ลบชุดที่ร่างทิ้งไว้ได้
  | "quote_delete"
  // ★ เฟส 3: ลำดับอนุมัติ Solar Sup → Sale Sup (เขียนจาก /api/quotations/[id]/action)
  | "quote_submit" | "quote_approve" | "quote_return" | "quote_revise"
  // ★ เฟส 4: ส่งใบให้ลูกค้า → ขั้นชำระเงิน · Account ยืนยันรับเงิน (+ เติมสิทธิ์ที่ซื้อ)
  | "quote_send" | "paid" | "pay_submit" | "pay_reject" | "pay_cheque"
  // ★ 14 ต.ค. 69 (แผน 20261014-03): เช็คที่รับแล้วเด้ง — แถวเงินเก็บไว้ ใบงานที่ยังไม่ถึงหน้างานกลับขั้นชำระเงิน
  | "pay_cheque_bounced"
  // ★ เฟส 5: ทีม O&M เปิดใบงานซ่อมจากใบที่ช่างแจ้งพบงานซ่อม (ผูก parent_booking_id)
  | "repair_open"
  // ★ 28 ก.ย. 69 (แผน 20260928-04 ข้อ 7): ปุ่ม Note ในหน้ารายละเอียด — โน้ตอิสระลงไทม์ไลน์ของบ้าน
  //   แบบ Note ของหน้า lead ฝั่งขาย · ข้อความอยู่ในช่อง reason (300 ตัวอักษร)
  | "note"
  // ★ 21 ต.ค. 69 (แผน 20261021-03): แท็บ Equipment - Serial — เพิ่ม/ลบ Serial อุปกรณ์ (reason = สรุป SN ที่เปลี่ยน)
  | "device";

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
  assign_team: "จ่ายทีมช่าง", assign_owner: "เปลี่ยนเจ้าของงาน",
  reorder: "สลับลำดับคิว", start: "เริ่มงาน",
  check: "ตรวจงานเสร็จ รอปิด", done: "ปิดงาน", cancel: "ยกเลิกนัด", no_show: "ลูกค้าไม่อยู่บ้าน",
  call: "บันทึกการโทร",
  quote: "ออกใบเสนอราคา", quote_edit: "แก้ใบเสนอราคา", quote_delete: "ลบใบเสนอราคาฉบับร่าง",
  quote_submit: "ส่งใบเสนอราคาขออนุมัติ", quote_approve: "อนุมัติใบเสนอราคา",
  quote_return: "ส่งใบเสนอราคากลับแก้", quote_revise: "สร้าง Revision ใบเสนอราคา",
  quote_send: "ส่งใบเสนอราคาให้ลูกค้า", paid: "ยืนยันรับเงินแล้ว",
  pay_submit: "แนบสลิปค่าบริการ รอ Account ยืนยัน", pay_reject: "Account ปฏิเสธสลิป",
  pay_cheque: "Account รับเช็คแล้ว รอเงินเข้า", pay_cheque_bounced: "เช็คเด้ง รอชำระใหม่",
  repair_open: "เปิดใบงานซ่อม",
  note: "บันทึกโน้ต",
  device: "แก้ไข Serial อุปกรณ์",
};

export const actionLabel = (a: string): string => LABEL[a as BookingAction] ?? a;

/**
 * ป้ายของ 1 แถวประวัติ — เหมือน actionLabel แต่ดู to_json ด้วย
 * ★ 28 ก.ย. 69 (แผน 20260928-05): action "check" มาจาก 2 ทาง
 *   · เปลี่ยนสถานะเป็นรอปิด (to_json มี status) → "ตรวจงานเสร็จ รอปิด" ตามเดิม
 *   · API ใบตรวจจดทุกครั้งที่กดบันทึก (บันทึกร่าง/ปิดงาน — to_json มีแต่ result/fail) → "บันทึกใบตรวจรับงาน"
 *   เดิมขึ้น "ตรวจงานเสร็จ รอปิด" ทุกแถว ใบที่กดบันทึกร่างหลายรอบเลยดูเหมือนตรวจเสร็จหลายรอบ
 */
export function historyLabel(action: string, toJson: string | null | undefined): string {
  if (action === "check" && !/"status"\s*:/.test(toJson ?? "")) return "บันทึกใบตรวจรับงาน";
  // บันทึกการติดตามทางอื่นที่ไม่ใช่โทร (ปุ่ม Follow-up · 1 ต.ค. 69) — ไม่เรียกว่า "บันทึกการโทร"
  if (action === "call") {
    const ch = /"channel"\s*:\s*"(visit|line|other)"/.exec(toJson ?? "")?.[1];
    if (ch) return `บันทึกการติดตาม · ${{ visit: "เยี่ยม", line: "LINE", other: "อื่นๆ" }[ch]}`;
  }
  // ใบเสนอราคา 3 ชุด (แผน 20261002-02): /send = ลูกค้าเลือกชุดนั้น · ประวัติเก่าไม่มี option_no คงป้าย "ส่งให้ลูกค้า"
  // แผน 20261002-10: ปุ่มขั้น 02 = ส่งให้ทีมขาย (handoff) · เลือก/เปลี่ยนชุดย้ายไปขั้นชำระเงิน (มี option_no)
  if (action === "quote_send" && /"handoff"\s*:\s*true/.test(toJson ?? "")) return "ส่งใบเสนอราคาให้ทีมขาย";
  if (action === "quote_send" || action === "quote") {
    const opt = /"option_no"\s*:\s*(\d+)/.exec(toJson ?? "")?.[1];
    if (opt) return action === "quote" ? `ออกใบเสนอราคาชุด ${opt}` : `ลูกค้าเลือกใบเสนอราคาชุด ${opt}`;
  }
  return actionLabel(action);
}
