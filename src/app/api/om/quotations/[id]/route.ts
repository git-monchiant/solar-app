import { NextRequest, NextResponse } from "next/server";
import { getEffectiveRolesFromReq, requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { logBooking } from "@/lib/om/booking-log";
import { getQuotationActor } from "@/lib/quotation";
import { OM_QUOTE_EDITABLE, canIssueOmQuotation, parseOmQuoteInput, readOmQuotes, writeOmQuoteBody } from "@/lib/om/om-quotation";
import { omErrorText } from "@/lib/om/api-error";

// ใบเสนอราคา O&M 1 ใบ — อ่าน / แก้ / ลบฉบับร่าง (แผน docs/plan/20260924-02 เฟส 2 · ลบร่าง 20261002-02)
// ★ รับเฉพาะใบที่ om_booking_id ไม่ว่าง — ใบของฝั่งขายต้องแก้ผ่าน /api/quotations เท่านั้น

type Params = { params: Promise<{ id: string }> };

// ตัวอ่านอยู่ lib — ใช้ร่วมกับรายการทุกชุดของใบงาน (GET /api/om/quotations?booking_id= · แผน 20261002-02)
const readQuote = async (id: number) => (await readOmQuotes(await getOmDb(), { id }))[0] ?? null;

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
    return NextResponse.json({ error: "ใบเสนอราคา O&M แก้ไขได้เฉพาะฝ่ายขาย" }, { status: 403 });

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
      return NextResponse.json({ error: "ใบเสนอราคานี้ส่งอนุมัติแล้ว จึงแก้ไขไม่ได้ — กรุณารอผล หรือให้ผู้อนุมัติส่งกลับมาแก้ไข" }, { status: 409 });
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
    return NextResponse.json({ error: omErrorText(e, "แก้ไขใบเสนอราคาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "PATCH /api/om/quotations/[id]") }, { status: 500 });
  }
  return NextResponse.json(await readQuote(id));
}

/**
 * ลบฉบับร่าง — แบบปุ่มถังขยะของฝั่งขาย (แผน 20261002-02: 3 ชุดต่อใบงาน ชุดที่ร่างทิ้งไว้ต้องลบได้
 * ไม่งั้นค้างขวาง "ลูกค้าเลือกชุดนี้" ที่ต้องอนุมัติครบทุกชุดก่อน)
 * ★ ไม่ใช้ DELETE /api/quotations/[id] ของฝั่งขาย — ตัวนั้นเขียน lead_activities (ไทม์ไลน์ขายของบ้านที่ใช้ lead ร่วมจะมีงาน O&M ปน)
 *   และไม่ลบรายการ (ตาราง quotations ไม่มี FK cascade) · ของเราลงประวัติใบงาน + ลบรายการด้วย
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const actor = await getQuotationActor(gate.userId);
  if (!actor) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 401 });
  if (!canIssueOmQuotation(getEffectiveRolesFromReq(req, actor.roles)))
    return NextResponse.json({ error: "ลบใบเสนอราคา O&M ได้เฉพาะฝ่ายขาย" }, { status: 403 });

  const id = Number((await params).id);
  const db = await getOmDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const q = (await new sql.Request(tx).input("id", sql.Int, id).query(`
      SELECT q.id, q.doc_no, q.status, q.option_no, q.revision_no, q.om_booking_id, b.status job_status, b.house_id
        FROM quotations q WITH (UPDLOCK) JOIN om_bookings b WITH (UPDLOCK) ON b.id = q.om_booking_id
       WHERE q.id = @id AND q.om_booking_id IS NOT NULL`)).recordset[0];
    const fail = async (error: string, status = 409) => { await tx.rollback(); return NextResponse.json({ error }, { status }); };
    if (!q) return fail("ไม่พบใบเสนอราคา O&M", 404);
    if (q.status !== "draft") return fail("ลบได้เฉพาะฉบับร่าง");
    if (q.job_status !== "quote") return fail("ใบงานไม่ได้อยู่ขั้นเสนอราคาแล้ว");

    await new sql.Request(tx).input("id", sql.Int, id).query(`
      DELETE FROM quotation_items WHERE quotation_id = @id;
      DELETE FROM dbo.quotation_approval_notifications WHERE quotation_id = @id;
      DELETE FROM quotations WHERE id = @id;`);
    await logBooking(tx, {
      bookingId: q.om_booking_id, houseId: q.house_id, action: "quote_delete", actorUserId: gate.userId,
      from: { doc_no: q.doc_no, option_no: q.option_no, revision_no: q.revision_no },
    });
    await tx.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    return NextResponse.json({ error: omErrorText(e, "ลบใบเสนอราคาไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "DELETE /api/om/quotations/[id]") }, { status: 500 });
  }
}
