import { NextRequest, NextResponse } from "next/server";
import { getEffectiveRolesFromReq, requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { logBooking } from "@/lib/om/booking-log";
import { getQuotationActor } from "@/lib/quotation";
import { resolveAccountingNotifications } from "@/lib/accounting-notifications";
import { grantPurchasedRights } from "@/lib/om/om-quotation";
import { notifyOmUser, resolveOmNotifications } from "@/lib/om/notifications";

// Account ยืนยันรับเงิน / ปฏิเสธสลิป ค่าบริการงาน O&M (แผน docs/plan/20260924-02 เฟส 4)
// ★ ผู้ใช้เคาะ 24 ก.ย. ข้อ 1 "Account เหมือนฝั่งขาย" — ยืนยันรับเงินอย่างเดียว สิทธิ์ account / admin
//   กดจากคิว /report/pending คิวเดียวกับฝั่งขาย (Account เข้าโมดูล O&M ไม่ได้ จึงยืนยันจากคิวตรง ๆ)
// ★ ยืนยัน = confirmed_at + เติมสิทธิ์ที่ซื้อ (grantPurchasedRights) · ใบงานค้างขั้นชำระเงิน (2330 ชำระแล้วรอนัด)
//   จนกว่า Sale จะโทรตกลงนัด — /api/om/follow ปล่อยให้ตกลงนัดได้เมื่อมีแถวที่ยืนยันแล้ว
// ★ ปฏิเสธ = ลบแถวทิ้ง (ยังไม่เคยนับเป็นเงินเข้า) เหตุผลเก็บในประวัติใบงาน · ใบงานกลับไป 2310 รอชำระ ให้ Sale แนบใหม่
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const actor = await getQuotationActor(gate.userId);
  if (!actor) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 401 });
  const roles = getEffectiveRolesFromReq(req, actor.roles);
  if (!roles.includes("account") && !roles.includes("admin"))
    return NextResponse.json({ error: "ยืนยันรับเงินได้เฉพาะ Account" }, { status: 403 });

  const id = Number((await params).id);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const reason = String(body.reason || "").trim().slice(0, 300);
  if (!["confirm", "reject"].includes(action)) return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
  if (action === "reject" && !reason) return NextResponse.json({ error: "ใส่เหตุผลที่ปฏิเสธด้วย — Sale ใช้แก้ไขก่อนแนบใหม่" }, { status: 400 });

  const db = await getOmDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const p = (await new sql.Request(tx).input("id", sql.Int, id).query(`
      SELECT p.id, p.lead_id, p.amount, p.slip_field, p.confirmed_at, p.submitted_by,
             q.id quotation_id, q.doc_no, q.om_package_id, q.created_by quote_by,
             b.id booking_id, b.house_id, b.status job_status, b.service_type_id, b.owner_user_id,
             h.house_number, l.full_name customer_name
        FROM payments p WITH (UPDLOCK)
        JOIN quotations q ON q.lead_id = p.lead_id AND p.slip_field = CONCAT(N'om_quote_', q.id)
        JOIN om_bookings b WITH (UPDLOCK) ON b.id = q.om_booking_id
        JOIN om_houses h ON h.id = b.house_id
        JOIN leads l ON l.id = p.lead_id
       WHERE p.id = @id AND p.slip_field LIKE 'om[_]quote[_]%'`)).recordset[0];
    const fail = async (error: string, status = 409) => { await tx.rollback(); return NextResponse.json({ error }, { status }); };
    if (!p) return fail("ไม่พบรายการค่าบริการ O&M", 404);
    if (p.confirmed_at) return fail("รายการนี้ยืนยันรับเงินไปแล้ว");

    if (action === "confirm") {
      await new sql.Request(tx).input("id", sql.Int, id).input("by", sql.NVarChar(200), actor.full_name)
        .query(`UPDATE payments SET confirmed_at = GETDATE(), confirmed_by = @by WHERE id = @id`);
      const grant = await grantPurchasedRights(tx, {
        houseId: p.house_id, serviceTypeId: p.service_type_id, omPackageId: p.om_package_id,
        docNo: p.doc_no, actorUserId: gate.userId,
      });
      await logBooking(tx, {
        bookingId: p.booking_id, houseId: p.house_id, action: "paid", actorUserId: gate.userId,
        to: { payment_id: id, amount: Number(p.amount), grant_qty: grant.qty },
        reason: grant.qty ? `เติมสิทธิ์ +${grant.qty} ครั้ง` : "บ้านนี้ไม่มีระบบติดตั้งในทะเบียน — ไม่ได้เติมสิทธิ์",
      });
    } else {
      await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM payments WHERE id = @id`);
      await logBooking(tx, {
        bookingId: p.booking_id, houseId: p.house_id, action: "pay_reject", actorUserId: gate.userId,
        from: { payment_id: id, amount: Number(p.amount) }, reason,
      });
    }
    await resolveAccountingNotifications(tx, { paymentId: id });

    // ★ แจ้ง Sale ในกล่องแจ้งเตือนของ O&M (ไม่ใช่กระดิ่งกลาง — ดูเหตุผลใน lib/om/notifications.ts)
    //   ผู้รับ: คนแนบสลิป · Sale ที่ออกใบ · เจ้าของใบงาน (ไม่ซ้ำ · ไม่แจ้งคนที่กดเอง)
    const recipients = [...new Set([p.submitted_by, p.quote_by, p.owner_user_id].filter((u): u is number => !!u))];
    const who = `${p.customer_name}${p.house_number ? ` · บ้าน ${p.house_number}` : ""}`;
    for (const uid of recipients) {
      await notifyOmUser(tx, action === "confirm"
        ? { recipientUserId: uid, type: "om_payment_confirmed", eventKey: `om_payment_confirmed:${id}`,
            title: `รับเงินค่าบริการ ${p.doc_no} แล้ว — โทรนัดได้`,
            message: `${who} · ${Number(p.amount).toLocaleString("th-TH")} บาท · ยืนยันโดย ${actor.full_name}`,
            houseId: p.house_id, bookingId: p.booking_id, createdBy: gate.userId }
        : { recipientUserId: uid, type: "om_payment_rejected", eventKey: `om_payment_rejected:${id}`,
            title: `Account ปฏิเสธสลิป ${p.doc_no} — แนบใหม่`,
            message: `${who} · เหตุผล: ${reason}`,
            houseId: p.house_id, bookingId: p.booking_id, createdBy: gate.userId });
    }
    // รับเงินแล้ว = เรื่องสลิปที่เคยถูกปฏิเสธของใบงานนี้จบแล้ว
    if (action === "confirm") await resolveOmNotifications(tx, { bookingId: p.booking_id, types: ["om_payment_rejected"] });
    await tx.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("POST /api/om/payments/[id]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ" }, { status: 500 });
  }
}
