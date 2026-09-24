import { NextRequest, NextResponse } from "next/server";
import { getEffectiveRolesFromReq, requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { ACTIVE_STATUS, statusLabel } from "@/lib/om/booking";
import { logBooking } from "@/lib/om/booking-log";
import { getQuotationActor } from "@/lib/quotation";
import {
  OM_PAYMENT_TERMS, canIssueOmQuotation, ensureOmLead, nextOmQuotationDocNo,
  parseOmQuoteInput, writeOmQuoteBody,
} from "@/lib/om/om-quotation";

// ออกใบเสนอราคางานบริการ O&M (แผน docs/plan/20260924-02 เฟส 2)
//
// ลำดับในคำขอเดียว (transaction เดียว — พังกลางทางต้องไม่มีอะไรค้าง):
//   ① หาใบงานค้างของบ้าน: ไม่มี = สร้างใบงานใหม่ที่ขั้นเสนอราคา · ติดตามอยู่ = ย้ายมาขั้นเสนอราคา
//      ขั้นอื่นที่ค้างอยู่ (นัดแล้ว/เข้างาน…) = ปฏิเสธ ต้องจบงานเดิมก่อน
//   ② lead เจ้าของบ้าน (มีแล้วใช้ตัวเดิม ไม่มีสร้าง om_only) — lib/om/om-quotation.ts
//   ③ ใบเสนอราคา draft ผูก om_booking_id + รายการ + ประวัติใบงาน
// ★ ยังไม่มีปุ่มส่งอนุมัติ — ลำดับ Solar Sup → Sale Sup + ป้าย O&M ในคิวเป็นงานเฟส 3
export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const actor = await getQuotationActor(gate.userId);
  if (!actor) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 401 });
  if (!canIssueOmQuotation(getEffectiveRolesFromReq(req, actor.roles)))
    return NextResponse.json({ error: "ใบเสนอราคา O&M ออกได้เฉพาะ Sale" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const houseId = Number(body.house_id);
  if (!houseId) return NextResponse.json({ error: "ต้องระบุบ้าน" }, { status: 400 });
  const input = parseOmQuoteInput(body);
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });

  const db = await getOmDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const cur = (await new sql.Request(tx).input("h", sql.Int, houseId).query(`
      SELECT TOP 1 id, status FROM om_bookings WITH (UPDLOCK, HOLDLOCK)
       WHERE house_id = @h AND status IN (${ACTIVE_STATUS.map((s) => `'${s}'`).join(",")})
       ORDER BY id DESC`)).recordset[0] as { id: number; status: string } | undefined;

    let bookingId: number;
    if (!cur) {
      const typeId = (await new sql.Request(tx)
        .query(`SELECT TOP 1 id FROM om_service_type WHERE code = 'cleaning'`)).recordset[0].id;
      bookingId = (await new sql.Request(tx)
        .input("h", sql.Int, houseId).input("t", sql.Int, typeId).input("u", sql.Int, gate.userId)
        .query(`INSERT INTO om_bookings (house_id, service_type_id, status, created_by, source)
                OUTPUT INSERTED.id VALUES (@h, @t, 'quote', @u, 'quote')`)).recordset[0].id;
    } else if (cur.status === "follow") {
      bookingId = cur.id;
      await new sql.Request(tx).input("id", sql.Int, bookingId)
        .query(`UPDATE om_bookings SET status = 'quote', updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);
    } else if (cur.status === "quote") {
      bookingId = cur.id;
      const has = (await new sql.Request(tx).input("b", sql.Int, bookingId)
        .query(`SELECT TOP 1 doc_no FROM quotations WHERE om_booking_id = @b`)).recordset[0];
      if (has) {
        await tx.rollback();
        return NextResponse.json({ error: `ใบงานนี้มีใบเสนอราคา ${has.doc_no} แล้ว — แก้ที่ใบเดิม` }, { status: 409 });
      }
    } else {
      await tx.rollback();
      return NextResponse.json(
        { error: `บ้านนี้มีงานค้างอยู่ (${statusLabel(cur.status)}) — ออกใบเสนอราคาได้เมื่อจบงานเดิมแล้ว` },
        { status: 409 });
    }

    const leadId = await ensureOmLead(tx, houseId, gate.userId);
    const docNo = await nextOmQuotationDocNo(tx);
    // แถวตั้งต้น — ยอดเงิน/รายการเติมโดย writeOmQuoteBody ที่เดียว (ใช้ร่วมกับตอนแก้ใบ)
    const quotationId = (await new sql.Request(tx)
      .input("l", sql.Int, leadId).input("doc", sql.NVarChar(50), docNo)
      .input("terms", sql.NVarChar(sql.MAX), JSON.stringify(OM_PAYMENT_TERMS))
      .input("u", sql.Int, gate.userId).input("b", sql.Int, bookingId)
      .query(`INSERT INTO quotations (lead_id, option_no, revision_no, doc_no, package_name_snapshot,
                package_price_snapshot, subtotal_incl_vat, contract_total_incl_vat, outstanding_amount,
                amount_before_vat, vat_amount, payment_terms_json, created_by, updated_by, om_booking_id)
              OUTPUT INSERTED.id
              VALUES (@l, 1, 0, @doc, N'', 0, 0, 0, 0, 0, 0, @terms, @u, @u, @b)`)).recordset[0].id as number;
    const { total } = await writeOmQuoteBody(tx, quotationId, input, gate.userId);

    await logBooking(tx, {
      bookingId, houseId, action: "quote", actorUserId: gate.userId,
      to: { doc_no: docNo, total }, reason: input.note,
    });
    await tx.commit();
    return NextResponse.json({ id: quotationId, doc_no: docNo, booking_id: bookingId, lead_id: leadId });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("POST /api/om/quotations", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "ออกใบเสนอราคาไม่สำเร็จ" }, { status: 500 });
  }
}
