import { NextRequest, NextResponse } from "next/server";
import { getEffectiveRolesFromReq, requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { logBooking } from "@/lib/om/booking-log";
import { getQuotationActor } from "@/lib/quotation";
import { notifyAccountingRole } from "@/lib/accounting-notifications";
import { OM_PAY_STEP_NO, canIssueOmQuotation, omSlipField } from "@/lib/om/om-quotation";

// ค่าบริการงาน O&M — Sale แนบสลิปของลูกค้า แล้วเข้าคิว Account (แผน docs/plan/20260924-02 เฟส 4)
//
// ★ ทำไมไม่ใช้ /api/slips + /api/payments ของฝั่งขาย (สำรวจแล้ว 24 ก.ย. 69):
//   ทางนั้นเขียนลง lead ตลอดทาง — pay token/ยอดใบแจ้งหนี้ของ lead (pay-tokens) · ออกเลข pre_doc_no ·
//   lead activity · แจ้งเตือนเจ้าของ lead ฝั่งขาย · คำนวณ journey/SLA ใหม่ · cheque ไป sync งวดขาย
//   บ้านที่ใช้ lead ร่วมกับฝั่งขาย ลิงก์จ่ายเงินที่ส่งให้ลูกค้าไปแล้วจะพัง และเงิน O&M ไปโผล่ในไทม์ไลน์ขาย
//   ⇒ ของ O&M เขียนแถว payments เองตรง ๆ (ตารางเดียวกัน Account มีบัญชีรับเงินชุดเดียว) ไม่แตะ lead เลย
// ★ 1 ใบเสนอราคา = เงิน 1 ก้อน เต็มจำนวน (เก็บก่อนนัด) · สลิปเก็บในช่อง slip_data 1–5 ของแถวเลย
//   ไม่ผ่าน slip_files (staging ของฝั่งขายผูกกับ lead + ขั้นขาย)

const MAX_FILES = 5;
const MAX_BYTES = 6 * 1024 * 1024;
const METHODS = ["transfer", "cash", "other"];

/** GET ?quotation_id= — แถวเงินของใบเสนอราคา O&M (ไม่ส่ง binary มา แค่ลิงก์รูป) */
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const qid = Number(req.nextUrl.searchParams.get("quotation_id"));
  if (!qid) return NextResponse.json({ error: "ต้องระบุใบเสนอราคา" }, { status: 400 });
  const db = await getOmDb();
  const slots = Array.from({ length: MAX_FILES }, (_, i) => `DATALENGTH(p.slip_data${i ? `_${i + 1}` : ""}) b${i + 1}`).join(", ");
  const r = await db.request().input("q", sql.Int, qid).input("sf", sql.NVarChar(50), omSlipField(qid)).query(`
    SELECT p.id, p.amount, p.payment_method, p.description, p.submitted_at, su.full_name submitted_by_name,
           p.confirmed_at, p.confirmed_by, ${slots}
      FROM payments p
      JOIN quotations q ON q.id = @q AND q.lead_id = p.lead_id
      LEFT JOIN users su ON su.id = p.submitted_by
     WHERE p.slip_field = @sf
     ORDER BY p.id DESC`);
  return NextResponse.json(fixDates(r.recordset).map((row: Record<string, unknown>) => {
    const urls: string[] = [];
    for (let n = 1; n <= MAX_FILES; n++) {
      if (Number(row[`b${n}`] || 0) > 0) urls.push(n === 1 ? `/api/payments/${row.id}` : `/api/payments/${row.id}?slot=${n}`);
      delete row[`b${n}`];
    }
    return { ...row, amount: Number(row.amount), slip_urls: urls };
  }));
}

/** POST multipart: quotation_id · amount · method · note · files (1–5 รูป/PDF) */
export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const actor = await getQuotationActor(gate.userId);
  if (!actor) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 401 });
  if (!canIssueOmQuotation(getEffectiveRolesFromReq(req, actor.roles)))
    return NextResponse.json({ error: "แนบสลิปค่าบริการ O&M ได้เฉพาะ Sale" }, { status: 403 });

  const form = await req.formData();
  const qid = Number(form.get("quotation_id"));
  const amount = Number(form.get("amount"));
  const method = String(form.get("method") || "transfer");
  const note = String(form.get("note") || "").trim().slice(0, 150) || null;
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!qid) return NextResponse.json({ error: "ต้องระบุใบเสนอราคา" }, { status: 400 });
  if (!METHODS.includes(method)) return NextResponse.json({ error: "วิธีชำระไม่ถูกต้อง" }, { status: 400 });
  if (files.length === 0) return NextResponse.json({ error: "แนบสลิปหรือรูปหลักฐานการรับเงินอย่างน้อย 1 รูป" }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `แนบได้ไม่เกิน ${MAX_FILES} รูป` }, { status: 400 });
  if (files.some((f) => f.size > MAX_BYTES)) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 6 MB" }, { status: 400 });
  if (files.some((f) => !/^image\/|^application\/pdf$/.test(f.type))) return NextResponse.json({ error: "แนบได้เฉพาะรูปหรือ PDF" }, { status: 400 });

  const db = await getOmDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const q = (await new sql.Request(tx).input("id", sql.Int, qid).query(`
      SELECT q.id, q.doc_no, q.status, q.lead_id, q.om_booking_id, q.contract_total_incl_vat total,
             b.status job_status, b.house_id, l.full_name customer_name,
             (SELECT MAX(q2.id) FROM quotations q2 WHERE q2.om_booking_id = q.om_booking_id) latest_id
        FROM quotations q JOIN om_bookings b WITH (UPDLOCK) ON b.id = q.om_booking_id
        JOIN leads l ON l.id = q.lead_id
       WHERE q.id = @id AND q.om_booking_id IS NOT NULL`)).recordset[0];
    const fail = async (error: string, status = 409) => { await tx.rollback(); return NextResponse.json({ error }, { status }); };
    if (!q) return fail("ไม่พบใบเสนอราคา O&M", 404);
    if (q.status !== "approved" || q.latest_id !== q.id) return fail("รับเงินได้เฉพาะใบล่าสุดที่อนุมัติแล้ว");
    if (q.job_status !== "payment") return fail("ใบงานยังไม่อยู่ขั้นชำระเงิน — ส่งใบเสนอราคาให้ลูกค้าก่อน");
    // เงินก้อนเดียวเต็มจำนวน — กันยอดพิมพ์ผิดแบบเดียวกับที่ฝั่งขายเคยเจอ (lead 686)
    if (Math.round(amount * 100) !== Math.round(Number(q.total) * 100))
      return fail(`ยอดไม่ตรงกับใบเสนอราคา — ต้องเป็น ${Number(q.total).toLocaleString("th-TH")} บาท`, 400);
    const slipField = omSlipField(qid);
    const dup = (await new sql.Request(tx).input("l", sql.Int, q.lead_id).input("sf", sql.NVarChar(50), slipField)
      .query(`SELECT TOP 1 id, confirmed_at FROM payments WITH (UPDLOCK, HOLDLOCK) WHERE lead_id = @l AND slip_field = @sf`)).recordset[0];
    if (dup) return fail(dup.confirmed_at ? "ใบนี้รับเงินครบแล้ว" : "มีสลิปรอ Account ยืนยันอยู่แล้ว — รอผลก่อน");

    const cols = ["lead_id", "step_no", "slip_field", "doc_no", "amount", "description", "payment_method", "submitted_by", "submitted_at"];
    const vals = ["@l", "@step", "@sf", "@doc", "@amt", "@desc", "@m", "@u", "GETDATE()"];
    const rq = new sql.Request(tx)
      .input("l", sql.Int, q.lead_id).input("step", sql.Int, OM_PAY_STEP_NO).input("sf", sql.NVarChar(50), slipField)
      .input("doc", sql.NVarChar(50), q.doc_no).input("amt", sql.Decimal(12, 2), Number(q.total))
      .input("desc", sql.NVarChar(200), `ค่าบริการ O&M ${q.doc_no}${note ? ` · ${note}` : ""}`.slice(0, 200))
      .input("m", sql.NVarChar(20), method).input("u", sql.Int, gate.userId);
    for (const [i, f] of files.entries()) {
      const s = i === 0 ? "" : `_${i + 1}`;
      cols.push(`slip_data${s}`, `slip_mime${s}`, `slip_filename${s}`);
      vals.push(`@d${i}`, `@mm${i}`, `@fn${i}`);
      rq.input(`d${i}`, sql.VarBinary(sql.MAX), Buffer.from(await f.arrayBuffer()))
        .input(`mm${i}`, sql.NVarChar(100), f.type).input(`fn${i}`, sql.NVarChar(200), f.name.slice(0, 200));
    }
    const paymentId = Number((await rq.query(
      `INSERT INTO payments (${cols.join(", ")}) OUTPUT INSERTED.id VALUES (${vals.join(", ")})`)).recordset[0].id);

    // กระดิ่ง Account ใช้ตัวเดียวกับฝั่งขาย — กดแล้วไปคิว /report/pending
    await notifyAccountingRole(tx, {
      paymentId, leadId: q.lead_id, slipField, type: "account_payment_waiting_review",
      title: `[O&M] ค่าบริการ ${q.doc_no} รอยืนยันรับเงิน`,
      message: `${q.customer_name} · ${Number(q.total).toLocaleString("th-TH")} บาท`,
      createdBy: gate.userId,
    });
    await logBooking(tx, {
      bookingId: q.om_booking_id, houseId: q.house_id, action: "pay_submit", actorUserId: gate.userId,
      to: { payment_id: paymentId, amount: Number(q.total), method, files: files.length }, reason: note,
    });
    await tx.commit();
    return NextResponse.json({ ok: true, id: paymentId });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("POST /api/om/payments", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกสลิปไม่สำเร็จ" }, { status: 500 });
  }
}
