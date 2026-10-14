import { NextRequest, NextResponse } from "next/server";
import { getEffectiveRolesFromReq, requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { logBooking } from "@/lib/om/booking-log";
import { getQuotationActor } from "@/lib/quotation";
import { resolveAccountingNotifications } from "@/lib/accounting-notifications";
import { OM_BOUNCE_BACK_TO_PAYMENT, grantPurchasedRights } from "@/lib/om/om-quotation";
import { notifyOmUser, resolveOmNotifications } from "@/lib/om/notifications";

// Account ยืนยันรับเงิน / ปฏิเสธสลิป ค่าบริการงาน O&M (แผน docs/plan/20260924-02 เฟส 4)
// ★ ผู้ใช้เคาะ 24 ก.ย. ข้อ 1 "Account เหมือนฝั่งขาย" — ยืนยันรับเงินอย่างเดียว สิทธิ์ account / admin
//   กดจากคิว /report/pending คิวเดียวกับฝั่งขาย (Account เข้าโมดูล O&M ไม่ได้ จึงยืนยันจากคิวตรง ๆ)
// ★ ยืนยัน = confirmed_at + เติมสิทธิ์ที่ซื้อ (grantPurchasedRights) · ใบงานค้างขั้นชำระเงิน (2330 ชำระแล้วรอนัด)
//   จนกว่า Sale จะโทรตกลงนัด — /api/om/follow ปล่อยให้ตกลงนัดได้เมื่อมีแถวที่ยืนยันแล้ว
// ★ ปฏิเสธ = ลบแถวทิ้ง (ยังไม่เคยนับเป็นเงินเข้า) เหตุผลเก็บในประวัติใบงาน · ใบงานกลับไป 2310 รอชำระ ให้ Sale แนบใหม่
// ★ เช็ค (แผน 20261002-11 · แบบฝั่งขาย): cheque_received = รับเช็คแล้ว ทำงานต่อได้ (โทรนัด) · confirm = เงินเข้าแล้ว + เติมสิทธิ์
//   ยืนยันเงินของเช็คต้องรับเช็คก่อน · ปฏิเสธ (ลบแถว) ได้เฉพาะเช็คที่ยังไม่รับ
// ★ แผน 20261014-03: cheque_bounced = เช็คที่รับแล้วเด้ง — เก็บแถวไว้แบบฝั่งขาย (cheque_status = 'bounced')
//   ใบงานที่ยังไม่ถึงหน้างานกลับขั้นชำระเงิน · ถึงหน้างานแล้วคงสถานะ · Sale แนบหลักฐานใหม่ได้ทั้งสองแบบ
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
  if (!["confirm", "reject", "cheque_received", "cheque_bounced"].includes(action)) return NextResponse.json({ error: "action ไม่ถูกต้อง" }, { status: 400 });
  if (action === "reject" && !reason) return NextResponse.json({ error: "ใส่เหตุผลที่ปฏิเสธด้วย — Sale ใช้แก้ไขก่อนแนบใหม่" }, { status: 400 });
  if (action === "cheque_bounced" && !reason) return NextResponse.json({ error: "ใส่เหตุผลด้วย (เช่น เช็คเด้ง / ลูกค้ายกเลิกเช็ค) — Sale ใช้ตามเก็บเงินใหม่" }, { status: 400 });

  const db = await getOmDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const p = (await new sql.Request(tx).input("id", sql.Int, id).query(`
      SELECT p.id, p.lead_id, p.amount, p.slip_field, p.confirmed_at, p.submitted_by, p.payment_method, p.cheque_received_at,
             p.cheque_status,
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
    if (p.cheque_status === "bounced") return fail("เช็คนี้บันทึกว่าเด้งแล้ว — รอ Sale แนบหลักฐานชำระใหม่");
    // ★ แผน 20261014-03: รับเช็คแล้ว = Sale โทรนัด/งานเดินต่อได้แล้ว — ห้ามลบแถวแบบปฏิเสธสลิป (ใบงานจะเดินต่อโดยไม่มีเงิน)
    //   ใช้ "เช็คเด้ง" แทน: เก็บแถวไว้แบบฝั่งขาย + ดึงใบงานที่ยังไม่ถึงหน้างานกลับขั้นชำระเงิน
    if (action === "reject" && p.cheque_received_at) return fail("รับเช็คไปแล้ว — ใช้ \"เช็คเด้ง\" แทนการปฏิเสธ");
    if (action === "cheque_bounced" && (p.payment_method !== "cheque" || !p.cheque_received_at))
      return fail("เช็คเด้งใช้กับเช็คที่รับไปแล้วเท่านั้น — เช็คที่ยังไม่รับให้กดปฏิเสธ", 400);
    if (action === "cheque_received" && p.payment_method !== "cheque") return fail("รองรับเฉพาะรายการรับชำระด้วยเช็ค", 400);
    if (action === "cheque_received" && p.cheque_received_at) return fail("รับเช็คไปแล้ว — รอยืนยันเงินเข้า");
    if (action === "confirm" && p.payment_method === "cheque" && !p.cheque_received_at) return fail("ยืนยันรับเช็คก่อน แล้วค่อยยืนยันเงินเข้า");
    let backToPayment = false;

    if (action === "cheque_received") {
      // คอลัมน์ชุดเดียวกับ PATCH /api/payments/[id] cheque_received ของฝั่งขาย
      await new sql.Request(tx).input("id", sql.Int, id).input("by", sql.NVarChar(100), actor.full_name)
        .query(`UPDATE payments SET cheque_received_at = GETDATE(), cheque_received_by = @by,
                  cheque_status = 'received', cheque_status_by = @by, cheque_status_at = GETDATE() WHERE id = @id`);
      await logBooking(tx, {
        bookingId: p.booking_id, houseId: p.house_id, action: "pay_cheque", actorUserId: gate.userId,
        to: { payment_id: id, amount: Number(p.amount) },
      });
    } else if (action === "confirm") {
      await new sql.Request(tx).input("id", sql.Int, id).input("by", sql.NVarChar(200), actor.full_name)
        .query(`UPDATE payments SET confirmed_at = GETDATE(), confirmed_by = @by WHERE id = @id`);
      const grant = await grantPurchasedRights(tx, {
        houseId: p.house_id, serviceTypeId: p.service_type_id, omPackageId: p.om_package_id,
        docNo: p.doc_no, actorUserId: gate.userId,
      });
      await logBooking(tx, {
        bookingId: p.booking_id, houseId: p.house_id, action: "paid", actorUserId: gate.userId,
        to: { payment_id: id, amount: Number(p.amount), grant_qty: grant.qty },
        reason: grant.qty ? `เติมสิทธิ์ +${grant.qty} ครั้ง`
          : grant.skip === "no_quota" ? "งานชนิดนี้ไม่ใช้สิทธิ์ (เช่น ซ่อม) — จ่ายรายงาน ไม่ต้องเติมสิทธิ์"
          : "บ้านนี้ไม่มีระบบติดตั้งในทะเบียน — ไม่ได้เติมสิทธิ์",
      });
    } else if (action === "cheque_bounced") {
      // คอลัมน์ชุดเดียวกับ PATCH /api/payments/[id] cheque_failed=bounced ของฝั่งขาย — แถวอยู่เป็นหลักฐาน
      await new sql.Request(tx).input("id", sql.Int, id).input("by", sql.NVarChar(100), actor.full_name)
        .input("note", sql.NVarChar(500), reason)
        .query(`UPDATE payments SET cheque_received_at = NULL, cheque_received_by = NULL, cheque_deposited_at = NULL,
                  cheque_status = 'bounced', cheque_status_note = @note, cheque_status_by = @by, cheque_status_at = GETDATE()
                WHERE id = @id`);
      backToPayment = OM_BOUNCE_BACK_TO_PAYMENT.includes(p.job_status);
      if (backToPayment)
        await new sql.Request(tx).input("b", sql.Int, p.booking_id)
          .query(`UPDATE om_bookings SET status = 'payment', updated_at = SYSDATETIMEOFFSET() WHERE id = @b`);
      await logBooking(tx, {
        bookingId: p.booking_id, houseId: p.house_id, action: "pay_cheque_bounced", actorUserId: gate.userId,
        from: { payment_id: id, amount: Number(p.amount), status: p.job_status },
        to: { status: backToPayment ? "payment" : p.job_status }, reason,
      });
    } else {
      await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM payments WHERE id = @id`);
      await logBooking(tx, {
        bookingId: p.booking_id, houseId: p.house_id, action: "pay_reject", actorUserId: gate.userId,
        from: { payment_id: id, amount: Number(p.amount) }, reason,
      });
    }
    // รับเช็ค = ยังรอยืนยันเงินเข้า กระดิ่ง Account ค้างไว้ (ปิดตอนยืนยันเงิน/ปฏิเสธ)
    if (action !== "cheque_received") await resolveAccountingNotifications(tx, { paymentId: id });

    // ★ แจ้ง Sale ในกล่องแจ้งเตือนของ O&M (ไม่ใช่กระดิ่งกลาง — ดูเหตุผลใน lib/om/notifications.ts)
    //   ผู้รับ: คนแนบสลิป · Sale ที่ออกใบ · เจ้าของใบงาน (ไม่ซ้ำ · ไม่แจ้งคนที่กดเอง)
    const recipients = [...new Set([p.submitted_by, p.quote_by, p.owner_user_id].filter((u): u is number => !!u))];
    const who = `${p.customer_name}${p.house_number ? ` · บ้าน ${p.house_number}` : ""}`;
    for (const uid of recipients) {
      await notifyOmUser(tx, action === "cheque_received"
        ? { recipientUserId: uid, type: "om_payment_cheque", eventKey: `om_payment_cheque:${id}`,
            title: `รับเช็คค่าบริการ ${p.doc_no} แล้ว — โทรนัดได้`,
            message: `${who} · ${Number(p.amount).toLocaleString("th-TH")} บาท · รับโดย ${actor.full_name} · รอ Account ยืนยันเงินเข้า`,
            houseId: p.house_id, bookingId: p.booking_id, createdBy: gate.userId }
        : action === "cheque_bounced"
        ? { recipientUserId: uid, type: "om_payment_cheque_bounced", eventKey: `om_payment_cheque_bounced:${id}`,
            title: `เช็คค่าบริการ ${p.doc_no} เด้ง — แนบหลักฐานชำระใหม่`,
            message: `${who} · เหตุผล: ${reason}${backToPayment ? " · ใบงานกลับขั้นชำระเงิน นัดเดิมพักไว้จนกว่าจะรับเงิน" : ""}`,
            houseId: p.house_id, bookingId: p.booking_id, createdBy: gate.userId }
        : action === "confirm"
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
    if (action === "confirm")
      await resolveOmNotifications(tx, { bookingId: p.booking_id, types: ["om_payment_rejected", "om_payment_cheque_bounced"] });
    await tx.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("POST /api/om/payments/[id]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "ดำเนินการไม่สำเร็จ" }, { status: 500 });
  }
}
