import { NextRequest, NextResponse } from "next/server";
import { getEffectiveRolesFromReq, requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { statusLabel } from "@/lib/om/booking";
import { logBooking } from "@/lib/om/booking-log";
import { resolveOmNotifications } from "@/lib/om/notifications";
import { canIssueOmQuotation } from "@/lib/om/om-quotation";
import { getQuotationActor } from "@/lib/quotation";

// ลูกค้าไม่เอา — ยกเลิกใบงานก่อนนัด พร้อมใบเสนอราคาของใบงาน (แผน docs/plan/20260924-02 · ทางออก "ไม่เอา (ปฏิเสธราคา)")
//
// ★ ทำไมต้องมี: ใบงานเส้นเสียเงินที่ออกใบเสนอราคาแล้ว ลูกค้าไม่ตกลงราคา ไม่มีทางออกเลย
//   ใบงานค้างขั้นเสนอราคา/ชำระเงินตลอดไป · ใบค้างในคิวอนุมัติ · นับเป็นงานค้างใน badge
// ★ ใบเสนอราคาใช้สถานะ 'cancelled' ที่ฝั่งขายเตรียมไว้แล้ว (migration 130 · ป้าย "ยกเลิกแล้ว" ใน QuotationBuilder)
//   คิวอนุมัติอ่านเฉพาะ pending_* ⇒ ใบหลุดคิวเอง · ปิดกระดิ่งผู้อนุมัติที่ยังไม่อ่านให้ด้วย
// ★ เงินเข้าแล้ว/สลิปรอตรวจ = ยกเลิกไม่ได้ — ต้องให้ Account ปฏิเสธสลิป/คืนเงินก่อน (เงินอยู่ใน payments คิวเดียวกับฝั่งขาย)
// ★ บ้านไปแท็บไหนต่อ:
//   ใบงานทั่วไป = บันทึกผลติดต่อ "ปฏิเสธ ไม่เอา" (action call) → บ้านไปแท็บ "ไม่เอา" แบบเดียวกับกดปฏิเสธตอนโทร
//     สิทธิ์ไม่ถูกตัด ลูกค้าเปลี่ยนใจ Sale ออกใบใหม่ได้
//   ใบงานซ่อม = บันทึก "ยกเลิก" เฉยๆ — บ้านถอยกลับไปใบต้นทาง (follow-sql ข้ามใบซ่อมที่ยกเลิก)
//     ห้ามบันทึก "ไม่เอา" ที่บ้าน ไม่งั้นรอบล้างถัดไปบ้านจะไปโผล่แท็บไม่เอาทั้งที่ลูกค้าแค่ไม่ซ่อม

// POST { reason }
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const b = await req.json().catch(() => ({}));
  const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 300) : "";
  if (!reason) return NextResponse.json({ error: "ใส่เหตุผลที่ลูกค้าไม่เอาด้วย" }, { status: 400 });

  const db = await getOmDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  const fail = async (error: string, status = 409) => { await tx.rollback(); return NextResponse.json({ error }, { status }); };
  try {
    const job = (await new sql.Request(tx).input("id", sql.Int, id).query(`
      SELECT id, house_id, status, parent_booking_id
        FROM om_bookings WITH (UPDLOCK, HOLDLOCK) WHERE id = @id`)).recordset[0] as
      { id: number; house_id: number; status: string; parent_booking_id: number | null } | undefined;
    if (!job) return fail("ไม่พบใบงานนี้", 404);
    const isRepair = job.parent_booking_id != null;
    // ก่อนนัดเท่านั้น — นัดแล้ว/เข้างานแล้วเป็นเรื่องยกเลิกนัด ไม่ใช่ลูกค้าไม่เอาราคา
    // ใบงานทั่วไปขั้นติดตามไม่ต้องใช้ปุ่มนี้ (บันทึกโทร "ปฏิเสธ ไม่เอา" ได้อยู่แล้ว)
    const allowed = isRepair ? ["follow", "quote", "payment"] : ["quote", "payment"];
    if (!allowed.includes(job.status))
      return fail(`ยกเลิกได้เฉพาะใบงานที่ยังไม่นัด (ตอนนี้: ${statusLabel(job.status)})`);

    const quotes = (await new sql.Request(tx).input("id", sql.Int, id).query(`
      SELECT id, doc_no, status FROM quotations WHERE om_booking_id = @id`)).recordset as
      { id: number; doc_no: string; status: string }[];
    if (quotes.length) {
      // ใบเสนอราคาเป็นของ Sale — คนที่ออก/ส่งอนุมัติใบได้ ถึงยกเลิกใบได้ (ชุดเดียวกับ POST /api/om/quotations)
      const actor = await getQuotationActor(gate.userId);
      if (!actor || !canIssueOmQuotation(getEffectiveRolesFromReq(req, actor.roles)))
        return fail("ยกเลิกใบเสนอราคา O&M ได้เฉพาะ Sale", 403);
      const pay = (await new sql.Request(tx).input("id", sql.Int, id).query(`
        SELECT TOP 1 p.id, p.confirmed_at FROM payments p
          JOIN quotations q ON q.lead_id = p.lead_id AND p.slip_field = CONCAT(N'om_quote_', q.id)
         WHERE q.om_booking_id = @id
         ORDER BY CASE WHEN p.confirmed_at IS NOT NULL THEN 0 ELSE 1 END`)).recordset[0];
      if (pay?.confirmed_at) return fail("รับเงินค่าบริการแล้ว — ยกเลิกไม่ได้ ต้องคืนเงินผ่าน Account ก่อน");
      if (pay) return fail("มีสลิปรอ Account ตรวจอยู่ — ให้ Account ปฏิเสธสลิปก่อนแล้วค่อยยกเลิก");

      await new sql.Request(tx).input("id", sql.Int, id).input("u", sql.Int, gate.userId).query(`
        UPDATE quotations SET status = 'cancelled', updated_by = @u, updated_at = GETDATE()
         WHERE om_booking_id = @id AND status <> 'cancelled';
        UPDATE dbo.quotation_approval_notifications SET read_at = COALESCE(read_at, GETDATE())
         WHERE read_at IS NULL AND quotation_id IN (SELECT id FROM quotations WHERE om_booking_id = @id);`);
    }

    await new sql.Request(tx).input("id", sql.Int, id).input("r", sql.NVarChar(300), reason).query(`
      UPDATE om_bookings SET status = 'cancelled', cancelled_reason = @r, updated_at = SYSDATETIMEOFFSET()
       WHERE id = @id`);

    const docs = quotes.filter((q) => q.status !== "cancelled").map((q) => q.doc_no);
    await logBooking(tx, isRepair
      ? { bookingId: id, houseId: job.house_id, action: "cancel", actorUserId: gate.userId,
          from: { status: job.status }, to: { status: "cancelled", quotations: docs }, reason }
      : { bookingId: id, houseId: job.house_id, action: "call", actorUserId: gate.userId,
          from: { status: job.status }, to: { outcome: "declined", status: "cancelled", quotations: docs }, reason });
    // งานจบแล้ว — ปิดกล่องแจ้งเตือน O&M ของใบงานนี้ทั้งหมด รวม "Account ปฏิเสธสลิป แนบใหม่" ที่ไม่ต้องทำแล้ว
    await resolveOmNotifications(tx, { bookingId: id });
    await resolveOmNotifications(tx, { bookingId: id, types: ["om_payment_rejected"] });
    await tx.commit();
    return NextResponse.json({ ok: true, id, cancelled_quotations: docs });
  } catch (e) {
    await tx.rollback().catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ" }, { status: 500 });
  }
}
