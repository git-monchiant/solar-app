import { NextRequest, NextResponse } from "next/server";
import { getEffectiveRolesFromReq, requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { logBooking } from "@/lib/om/booking-log";
import { getQuotationActor } from "@/lib/quotation";
import { canIssueOmQuotation } from "@/lib/om/om-quotation";

// ส่งใบเสนอราคา O&M ที่อนุมัติครบแล้วให้ลูกค้า → ใบงานเข้าขั้นชำระเงิน (แผน docs/plan/20260924-02 เฟส 4)
// ★ เทียบกับฝั่งขาย: อนุมัติครบ → ส่งให้ลูกค้า → ขั้นชำระเงิน (ของขายคือ handoff_to_sales ที่ตั้ง lead เป็น order)
//   ของ O&M ไม่แตะ lead เลย ย้ายแค่ใบงาน quote → payment และจดเวลาส่งลงคอลัมน์ sent_to_customer_* เดิม
// ★ ต้องเป็นใบล่าสุดของใบงาน — ใบเก่าที่มี Revision ใหม่กว่าแล้วห้ามส่ง (ลูกค้าจะได้ราคาที่ถูกแก้ไปแล้ว)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const actor = await getQuotationActor(gate.userId);
  if (!actor) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 401 });
  if (!canIssueOmQuotation(getEffectiveRolesFromReq(req, actor.roles)))
    return NextResponse.json({ error: "ส่งใบเสนอราคา O&M ให้ลูกค้าได้เฉพาะ Sale" }, { status: 403 });

  const id = Number((await params).id);
  const db = await getOmDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const q = (await new sql.Request(tx).input("id", sql.Int, id).query(`
      SELECT q.id, q.doc_no, q.status, q.om_booking_id, b.status job_status, b.house_id,
             (SELECT MAX(q2.id) FROM quotations q2 WHERE q2.om_booking_id = q.om_booking_id) latest_id
        FROM quotations q WITH (UPDLOCK) JOIN om_bookings b WITH (UPDLOCK) ON b.id = q.om_booking_id
       WHERE q.id = @id AND q.om_booking_id IS NOT NULL`)).recordset[0];
    const fail = async (error: string, status = 409) => { await tx.rollback(); return NextResponse.json({ error }, { status }); };
    if (!q) return fail("ไม่พบใบเสนอราคา O&M", 404);
    if (q.status !== "approved") return fail("ส่งให้ลูกค้าได้เฉพาะใบที่อนุมัติครบทั้งสองขั้นแล้ว");
    if (q.latest_id !== q.id) return fail("ใบนี้มี Revision ใหม่กว่าแล้ว — ส่งใบล่าสุดแทน");
    if (q.job_status !== "quote") return fail("ใบงานไม่ได้อยู่ขั้นเสนอราคาแล้ว");

    await new sql.Request(tx).input("id", sql.Int, id).input("u", sql.Int, gate.userId)
      .query(`UPDATE quotations SET sent_to_customer_by = @u, sent_to_customer_at = GETDATE(),
                updated_by = @u, updated_at = GETDATE() WHERE id = @id`);
    await new sql.Request(tx).input("b", sql.Int, q.om_booking_id)
      .query(`UPDATE om_bookings SET status = 'payment', updated_at = SYSDATETIMEOFFSET() WHERE id = @b`);
    await logBooking(tx, {
      bookingId: q.om_booking_id, houseId: q.house_id, action: "quote_send", actorUserId: gate.userId,
      from: { status: "quote" }, to: { status: "payment", doc_no: q.doc_no },
    });
    await tx.commit();
    return NextResponse.json({ ok: true, booking_id: q.om_booking_id });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("POST /api/om/quotations/[id]/send", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "ส่งใบเสนอราคาไม่สำเร็จ" }, { status: 500 });
  }
}
