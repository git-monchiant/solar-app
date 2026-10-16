import { NextRequest, NextResponse } from "next/server";
import { getEffectiveRolesFromReq, requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { logBooking } from "@/lib/om/booking-log";
import { getQuotationActor } from "@/lib/quotation";
import { OM_PAY_LIVE_SQL, OM_SLIP_PREFIX, canIssueOmQuotation } from "@/lib/om/om-quotation";

// ส่งใบเสนอราคา O&M ที่อนุมัติครบแล้วให้ลูกค้า → ใบงานเข้าขั้นชำระเงิน (แผน docs/plan/20260924-02 เฟส 4)
// ★ เทียบกับฝั่งขาย: อนุมัติครบ → ส่งให้ลูกค้า → ขั้นชำระเงิน (ของขายคือ handoff_to_sales ที่ตั้ง lead เป็น order)
//   ของ O&M ไม่แตะ lead เลย ย้ายแค่ใบงาน quote → payment และจดเวลาส่งลงคอลัมน์ sent_to_customer_* เดิม
// ★ ต้องเป็นใบล่าสุดของชุด — ใบเก่าที่มี Revision ใหม่กว่าแล้วห้ามส่ง (ลูกค้าจะได้ราคาที่ถูกแก้ไปแล้ว)
// ★ 3 ชุดต่อใบงาน (แผน 20261002-02): ทางนี้ = "ลูกค้าเลือกชุดนี้" — ใบที่จดเวลาส่งลูกค้าคือใบของใบงาน
//   (ขั้นชำระเงินรับเงินของใบนี้) · ต้องอนุมัติครบทุกชุดก่อนแบบฝั่งขาย ไม่งั้นชุดที่ค้างรออนุมัติจะค้างคิวตลอดไป
// ★ แผน 20261002-10 เลือกชุดที่ขั้นชำระเงินแบบขั้น Order ฝั่งขาย — ทางนี้ทำ 2 อย่างตามขั้นของใบงาน
//   · ขั้นเสนอราคา = ปุ่ม "ส่งใบเสนอราคาให้ทีมขาย" → ใบงานไปขั้นชำระเงิน · ใบที่ส่งมา (ชุดแรก) เป็นชุดที่เลือกไว้ก่อน
//     แบบฝั่งขายที่ตั้ง quotation_accepted_idx = 0 ให้เองตอนยังไม่มีใครเลือก
//   · ขั้นชำระเงิน = เปลี่ยนชุดที่ลูกค้าเลือก — ได้จนกว่าจะแนบสลิป (สลิปผูกเลขใบ · Account ปฏิเสธสลิปแล้วเปลี่ยนได้อีก)
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
      SELECT q.id, q.doc_no, q.option_no, q.status, q.om_booking_id, b.status job_status, b.house_id,
             (SELECT MAX(q2.id) FROM quotations q2
               WHERE q2.om_booking_id = q.om_booking_id AND q2.option_no = q.option_no) latest_id,
             -- ใบล่าสุดของชุดอื่นที่ยังไม่อนุมัติ (ไม่นับยกเลิก)
             (SELECT COUNT(*) FROM quotations q3
               WHERE q3.om_booking_id = q.om_booking_id AND q3.status NOT IN ('approved', 'cancelled')
                 AND q3.id = (SELECT MAX(q4.id) FROM quotations q4
                               WHERE q4.om_booking_id = q3.om_booking_id AND q4.option_no = q3.option_no)) not_ready,
             -- ชุดที่เลือกอยู่ตอนนี้ (ขั้นชำระเงิน) · สลิปของใบไหนก็ได้ในใบงาน = ล็อกการเปลี่ยนชุด
             (SELECT TOP 1 q5.doc_no FROM quotations q5
               WHERE q5.om_booking_id = q.om_booking_id AND q5.sent_to_customer_at IS NOT NULL ORDER BY q5.id DESC) chosen_doc_no,
             -- เช็คเด้งเก็บแถวไว้แต่ไม่ล็อกชุด (แผน 20261014-03) — เหมือนสลิปที่ถูกปฏิเสธ
             (SELECT COUNT(*) FROM quotations q6 JOIN payments p
                 ON p.lead_id = q6.lead_id AND p.slip_field = CONCAT(N'${OM_SLIP_PREFIX}', q6.id)
               WHERE q6.om_booking_id = q.om_booking_id AND ${OM_PAY_LIVE_SQL("p")}) pay_rows,
             q.sent_to_customer_at
        FROM quotations q WITH (UPDLOCK) JOIN om_bookings b WITH (UPDLOCK) ON b.id = q.om_booking_id
       WHERE q.id = @id AND q.om_booking_id IS NOT NULL`)).recordset[0];
    const fail = async (error: string, status = 409) => { await tx.rollback(); return NextResponse.json({ error }, { status }); };
    if (!q) return fail("ไม่พบใบเสนอราคา O&M", 404);
    if (q.status !== "approved") return fail("ลูกค้าเลือกได้เฉพาะใบที่อนุมัติครบทั้งสองขั้นแล้ว");
    if (q.latest_id !== q.id) return fail("ใบนี้มี Revision ใหม่กว่าแล้ว — เลือกใบล่าสุดของชุดนี้แทน");
    if (q.job_status !== "quote" && q.job_status !== "payment") return fail("ใบงานไม่ได้อยู่ขั้นเสนอราคา/ชำระเงินแล้ว");
    if (q.not_ready > 0) return fail("ยังมีชุดที่ไม่ได้อนุมัติ — อนุมัติให้ครบทุกชุด (หรือลบชุดที่ร่างทิ้งไว้) ก่อนส่งใบเสนอราคา");
    const handoff = q.job_status === "quote";
    if (!handoff) {
      if (q.sent_to_customer_at) { await tx.rollback(); return NextResponse.json({ ok: true, booking_id: q.om_booking_id }); }
      if (q.pay_rows > 0) return fail("แนบสลิปค่าบริการแล้ว — เปลี่ยนชุดไม่ได้ (Account ปฏิเสธสลิปก่อนจึงเปลี่ยนได้)");
    }

    // ชุดที่เลือกมีได้ใบเดียวต่อใบงาน — ล้างของชุดเดิมก่อน
    await new sql.Request(tx).input("b", sql.Int, q.om_booking_id).input("id", sql.Int, id)
      .query(`UPDATE quotations SET sent_to_customer_by = NULL, sent_to_customer_at = NULL
               WHERE om_booking_id = @b AND id <> @id AND sent_to_customer_at IS NOT NULL`);
    await new sql.Request(tx).input("id", sql.Int, id).input("u", sql.Int, gate.userId)
      .query(`UPDATE quotations SET sent_to_customer_by = @u, sent_to_customer_at = GETDATE(),
                updated_by = @u, updated_at = GETDATE() WHERE id = @id`);
    if (handoff)
      await new sql.Request(tx).input("b", sql.Int, q.om_booking_id)
        .query(`UPDATE om_bookings SET status = 'payment', updated_at = SYSDATETIMEOFFSET() WHERE id = @b`);
    await logBooking(tx, {
      bookingId: q.om_booking_id, houseId: q.house_id, action: "quote_send", actorUserId: gate.userId,
      // handoff = ป้าย "ส่งใบเสนอราคาให้ทีมขาย" · เปลี่ยนชุด = "ลูกค้าเลือกใบเสนอราคาชุด N" (lib/om/booking-log historyLabel)
      from: handoff ? { status: "quote" } : { status: "payment", doc_no: q.chosen_doc_no },
      to: handoff ? { status: "payment", doc_no: q.doc_no, handoff: true }
        : { status: "payment", doc_no: q.doc_no, option_no: q.option_no },
    });
    await tx.commit();
    return NextResponse.json({ ok: true, booking_id: q.om_booking_id });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("POST /api/om/quotations/[id]/send", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "ส่งใบเสนอราคาไม่สำเร็จ" }, { status: 500 });
  }
}
