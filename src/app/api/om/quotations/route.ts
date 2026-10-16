import { NextRequest, NextResponse } from "next/server";
import { getEffectiveRolesFromReq, requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { ACTIVE_STATUS, statusLabel } from "@/lib/om/booking";
import { logBooking } from "@/lib/om/booking-log";
import { getQuotationActor } from "@/lib/quotation";
import {
  OM_MAX_OPTIONS, OM_PAYMENT_TERMS, canIssueOmQuotation, ensureOmLead, nextOmQuotationDocNo,
  parseOmQuoteInput, readOmQuotes, writeOmQuoteBody,
} from "@/lib/om/om-quotation";

// ออกใบเสนอราคางานบริการ O&M (แผน docs/plan/20260924-02 เฟส 2)
//
// ลำดับในคำขอเดียว (transaction เดียว — พังกลางทางต้องไม่มีอะไรค้าง):
//   ① หาใบงานค้างของบ้าน: ไม่มี = สร้างใบงานใหม่ที่ขั้นเสนอราคา · ติดตามอยู่ = ย้ายมาขั้นเสนอราคา
//      ขั้นอื่นที่ค้างอยู่ (นัดแล้ว/เข้างาน…) = ปฏิเสธ ต้องจบงานเดิมก่อน
//   ② lead เจ้าของบ้าน (มีแล้วใช้ตัวเดิม ไม่มีสร้าง om_only) — lib/om/om-quotation.ts
//   ③ ใบเสนอราคา draft ผูก om_booking_id + รายการ + ประวัติใบงาน
// ★ 3 ชุดต่อใบงานแบบฝั่งขาย (แผน 20261002-02): body.option_no 1–3 (ไม่ส่ง = 1)
//   ใบงานขั้นเสนอราคาเพิ่มชุดได้ · ชุดที่มีใบอยู่แล้ว (ไม่นับยกเลิก) ห้ามออกซ้ำ — แก้/Revision ที่ใบเดิม

/** GET ?booking_id= — ทุกใบ (ทุกชุด ทุก Revision) ของใบงาน · หน้าจอเลือกใบล่าสุดของแต่ละชุดเอง แบบฝั่งขาย
 *  + บันทึกของขั้นเสนอราคา (om_bookings.quote_note · ช่อง "บันทึกถึงฝ่ายขาย" ใต้การ์ด · แผน 20261002-03) */
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const bookingId = Number(req.nextUrl.searchParams.get("booking_id"));
  if (!bookingId) return NextResponse.json({ error: "ต้องระบุใบงาน" }, { status: 400 });
  const db = await getOmDb();
  const [quotes, job] = await Promise.all([
    readOmQuotes(db, { bookingId }),
    db.request().input("b", sql.Int, bookingId).query(`SELECT quote_note FROM om_bookings WHERE id = @b`),
  ]);
  return NextResponse.json({ quotes, quote_note: job.recordset[0]?.quote_note ?? null });
}

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
  const optionNo = body.option_no == null ? 1 : Number(body.option_no);
  if (!Number.isInteger(optionNo) || optionNo < 1 || optionNo > OM_MAX_OPTIONS)
    return NextResponse.json({ error: `ชุดใบเสนอราคาต้องเป็น 1–${OM_MAX_OPTIONS}` }, { status: 400 });

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
      const has = (await new sql.Request(tx).input("b", sql.Int, bookingId).input("o", sql.Int, optionNo)
        .query(`SELECT TOP 1 doc_no FROM quotations WITH (UPDLOCK, HOLDLOCK)
                 WHERE om_booking_id = @b AND option_no = @o AND status <> 'cancelled'`)).recordset[0];
      if (has) {
        await tx.rollback();
        return NextResponse.json({ error: `ชุด ${optionNo} มีใบเสนอราคา ${has.doc_no} แล้ว — แก้ที่ใบเดิม` }, { status: 409 });
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
      .input("u", sql.Int, gate.userId).input("b", sql.Int, bookingId).input("o", sql.Int, optionNo)
      .query(`INSERT INTO quotations (lead_id, option_no, revision_no, doc_no, package_name_snapshot,
                package_price_snapshot, subtotal_incl_vat, contract_total_incl_vat, outstanding_amount,
                amount_before_vat, vat_amount, payment_terms_json, created_by, updated_by, om_booking_id)
              OUTPUT INSERTED.id
              VALUES (@l, @o, 0, @doc, N'', 0, 0, 0, 0, 0, 0, @terms, @u, @u, @b)`)).recordset[0].id as number;
    const { total } = await writeOmQuoteBody(tx, quotationId, input, gate.userId);

    await logBooking(tx, {
      bookingId, houseId, action: "quote", actorUserId: gate.userId,
      to: { doc_no: docNo, total, option_no: optionNo }, reason: input.note,
    });
    await tx.commit();
    return NextResponse.json({ id: quotationId, doc_no: docNo, booking_id: bookingId, lead_id: leadId });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("POST /api/om/quotations", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "ออกใบเสนอราคาไม่สำเร็จ" }, { status: 500 });
  }
}
