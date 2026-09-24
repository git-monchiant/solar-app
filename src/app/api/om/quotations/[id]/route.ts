import { NextRequest, NextResponse } from "next/server";
import { getEffectiveRolesFromReq, requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { logBooking } from "@/lib/om/booking-log";
import { getQuotationActor } from "@/lib/quotation";
import { OM_QUOTE_EDITABLE, canIssueOmQuotation, parseOmQuoteInput, writeOmQuoteBody } from "@/lib/om/om-quotation";

// ใบเสนอราคา O&M 1 ใบ — อ่าน / แก้ (แผน docs/plan/20260924-02 เฟส 2)
// ★ รับเฉพาะใบที่ om_booking_id ไม่ว่าง — ใบของฝั่งขายต้องแก้ผ่าน /api/quotations เท่านั้น

type Params = { params: Promise<{ id: string }> };

const readQuote = async (id: number) => {
  const db = await getOmDb();
  const r = await db.request().input("id", sql.Int, id).query(`
    SELECT q.id, q.doc_no, q.status, q.om_booking_id, q.lead_id, q.issue_date, q.valid_days,
           q.package_name_snapshot, q.package_price_snapshot, q.subtotal_incl_vat, q.discount_value,
           q.discount_amount, q.discount_reason, q.contract_total_incl_vat, q.amount_before_vat, q.vat_amount,
           q.terms_text, q.note, q.created_at, q.updated_at, cu.full_name created_by_name,
           b.house_id, q.om_package_id
      FROM quotations q
      JOIN om_bookings b ON b.id = q.om_booking_id
      LEFT JOIN users cu ON cu.id = q.created_by
     WHERE q.id = @id AND q.om_booking_id IS NOT NULL;
    SELECT id, item_name_snapshot item_name, quantity, unit, unit_price, line_total
      FROM quotation_items WHERE quotation_id = @id ORDER BY sort_order, id;`);
  const sets = r.recordsets as unknown as Record<string, unknown>[][];
  const q = sets[0][0];
  return q ? { ...fixDates([q])[0], items: fixDates(sets[1]) } : null;
};

export async function GET(req: NextRequest, { params }: Params) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const q = await readQuote(Number((await params).id));
  return q ? NextResponse.json(q) : NextResponse.json({ error: "ไม่พบใบเสนอราคา O&M" }, { status: 404 });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const actor = await getQuotationActor(gate.userId);
  if (!actor) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 401 });
  if (!canIssueOmQuotation(getEffectiveRolesFromReq(req, actor.roles)))
    return NextResponse.json({ error: "ใบเสนอราคา O&M แก้ได้เฉพาะ Sale" }, { status: 403 });

  const id = Number((await params).id);
  const body = await req.json().catch(() => ({}));
  const input = parseOmQuoteInput(body);
  if (typeof input === "string") return NextResponse.json({ error: input }, { status: 400 });

  const db = await getOmDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const q = (await new sql.Request(tx).input("id", sql.Int, id).query(`
      SELECT q.id, q.doc_no, q.status, q.om_booking_id, q.contract_total_incl_vat total, b.house_id
        FROM quotations q WITH (UPDLOCK) JOIN om_bookings b ON b.id = q.om_booking_id
       WHERE q.id = @id AND q.om_booking_id IS NOT NULL`)).recordset[0];
    if (!q) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบใบเสนอราคา O&M" }, { status: 404 }); }
    if (!OM_QUOTE_EDITABLE.includes(q.status)) {
      await tx.rollback();
      return NextResponse.json({ error: "ใบนี้ส่งอนุมัติไปแล้ว แก้ไม่ได้ — รอผลหรือให้ผู้อนุมัติส่งกลับมาแก้" }, { status: 409 });
    }
    const { total } = await writeOmQuoteBody(tx, id, input, gate.userId);
    await logBooking(tx, {
      bookingId: q.om_booking_id, houseId: q.house_id, action: "quote_edit", actorUserId: gate.userId,
      from: { total: Number(q.total) }, to: { doc_no: q.doc_no, total },
      reason: input.note,
    });
    await tx.commit();
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("PATCH /api/om/quotations/[id]", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "แก้ใบเสนอราคาไม่สำเร็จ" }, { status: 500 });
  }
  return NextResponse.json(await readQuote(id));
}
