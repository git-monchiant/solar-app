import { NextRequest, NextResponse } from "next/server";
import { getEffectiveRolesFromReq, requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { logBooking } from "@/lib/om/booking-log";
import { getQuotationActor } from "@/lib/quotation";
import { notifyAccountingRole } from "@/lib/accounting-notifications";
import {
  OM_PAY_LIVE_SQL, OM_PAY_STEP_NO, OM_REPAY_AFTER_BOUNCE, OM_SLIP_PREFIX, canIssueOmQuotation, omSlipField,
} from "@/lib/om/om-quotation";
import { omErrorText } from "@/lib/om/api-error";

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
// transfer/cash = ฟอร์มเดิม · qr/bank_transfer/other/cheque = แท็บแบบ PaymentSection ฝั่งขาย (แผน 20261002-11)
const METHODS = ["transfer", "cash", "other", "qr", "bank_transfer", "cheque"];
/** ค่าธรรมเนียมบัตรเครดิต % — ชุดเดียวกับ CC_RATES ของ OrderStep ฝั่งขาย */
const CC_RATES = [0, 1.5, 2, 2.5, 3];

/** GET ?quotation_id= — แถวเงินของใบเสนอราคา O&M (ไม่ส่ง binary มา แค่ลิงก์รูป) */
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const qid = Number(req.nextUrl.searchParams.get("quotation_id"));
  if (!qid) return NextResponse.json({ error: "ไม่พบใบเสนอราคาที่ระบุ" }, { status: 400 });
  const db = await getOmDb();
  const slots = Array.from({ length: MAX_FILES }, (_, i) => `DATALENGTH(p.slip_data${i ? `_${i + 1}` : ""}) b${i + 1}`).join(", ");
  const r = await db.request().input("q", sql.Int, qid).input("sf", sql.NVarChar(50), omSlipField(qid)).query(`
    SELECT p.id, p.lead_id, p.amount, p.payment_method, p.description, p.submitted_at, su.full_name submitted_by_name,
           p.confirmed_at, p.confirmed_by, p.actual_receipt_url, p.cheque_received_at, p.cheque_received_by,
           p.cc_surcharge_pct, p.cc_surcharge_amount,
           -- เช็คเด้ง (แผน 20261014-03) — แถวเก็บไว้ หน้าจอโชว์เป็นประวัติ ไม่ใช่สลิปปัจจุบัน
           p.cheque_status, p.cheque_status_note, p.cheque_status_by, p.cheque_status_at, ${slots}
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
    return { ...row, amount: Number(row.amount), slip_urls: urls,
      cc_surcharge_pct: row.cc_surcharge_pct == null ? null : Number(row.cc_surcharge_pct),
      cc_surcharge_amount: Number(row.cc_surcharge_amount || 0) };
  }));
}

/** POST multipart: quotation_id · amount · method · note · files (1–5 รูป/PDF)
 *  · cc=1 + cc_pct = จ่ายบัตรเครดิต บวกค่าธรรมเนียม (แบบฝั่งขาย · amount ยังเป็นยอดใบ ค่าธรรมเนียมแยกคอลัมน์)
 *  · method other ต้องมี note (ชำระโดย / รายละเอียด) · cheque = Account รับเช็คก่อน แล้วยืนยันเงินเข้าอีกรอบ */
export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const actor = await getQuotationActor(gate.userId);
  if (!actor) return NextResponse.json({ error: "ไม่พบผู้ใช้" }, { status: 401 });
  if (!canIssueOmQuotation(getEffectiveRolesFromReq(req, actor.roles)))
    return NextResponse.json({ error: "แนบสลิปค่าบริการ O&M ได้เฉพาะฝ่ายขาย" }, { status: 403 });

  const form = await req.formData();
  const qid = Number(form.get("quotation_id"));
  const amount = Number(form.get("amount"));
  const method = String(form.get("method") || "transfer");
  const note = String(form.get("note") || "").trim().slice(0, 150) || null;
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!qid) return NextResponse.json({ error: "ไม่พบใบเสนอราคาที่ระบุ" }, { status: 400 });
  if (!METHODS.includes(method)) return NextResponse.json({ error: "วิธีชำระเงินไม่ถูกต้อง" }, { status: 400 });
  const cc = form.get("cc") === "1";
  const ccPct = cc ? Number(form.get("cc_pct")) : 0;
  if (cc && !CC_RATES.includes(ccPct)) return NextResponse.json({ error: "ค่าธรรมเนียมบัตรเครดิตไม่ถูกต้อง" }, { status: 400 });
  if (cc && method === "cheque") return NextResponse.json({ error: "กรุณาเลือกอย่างใดอย่างหนึ่ง — เช็ค หรือ บัตรเครดิต" }, { status: 400 });
  if (method === "other" && !note) return NextResponse.json({ error: "กรุณากรอกรายละเอียดการชำระเงิน (ชำระโดย)" }, { status: 400 });
  if (files.length === 0) return NextResponse.json({ error: "กรุณาแนบสลิปหรือหลักฐานการชำระเงินอย่างน้อย 1 รูป" }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `แนบได้ไม่เกิน ${MAX_FILES} รูป` }, { status: 400 });
  if (files.some((f) => f.size > MAX_BYTES)) return NextResponse.json({ error: "ไฟล์มีขนาดเกิน 6 MB" }, { status: 400 });
  if (files.some((f) => !/^image\/|^application\/pdf$/.test(f.type))) return NextResponse.json({ error: "แนบได้เฉพาะรูปหรือ PDF" }, { status: 400 });

  const db = await getOmDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const q = (await new sql.Request(tx).input("id", sql.Int, qid).query(`
      SELECT q.id, q.doc_no, q.status, q.lead_id, q.om_booking_id, q.contract_total_incl_vat total,
             b.status job_status, b.house_id, l.full_name customer_name, q.sent_to_customer_at,
             (SELECT MAX(q2.id) FROM quotations q2
               WHERE q2.om_booking_id = q.om_booking_id AND q2.option_no = q.option_no) latest_id,
             (SELECT COUNT(*) FROM payments bp WHERE bp.lead_id = q.lead_id
                 AND bp.slip_field = CONCAT(N'${OM_SLIP_PREFIX}', q.id) AND bp.cheque_status = N'bounced') bounced
        FROM quotations q JOIN om_bookings b WITH (UPDLOCK) ON b.id = q.om_booking_id
        JOIN leads l ON l.id = q.lead_id
       WHERE q.id = @id AND q.om_booking_id IS NOT NULL`)).recordset[0];
    const fail = async (error: string, status = 409) => { await tx.rollback(); return NextResponse.json({ error }, { status }); };
    if (!q) return fail("ไม่พบใบเสนอราคา O&M", 404);
    if (q.status !== "approved" || q.latest_id !== q.id) return fail("รับเงินได้เฉพาะใบล่าสุดที่อนุมัติแล้ว");
    // 3 ชุดต่อใบงาน (แผน 20261002-02) — เงินเป็นของชุดที่ลูกค้าเลือก (/send จดเวลาไว้) ชุดอื่นห้ามรับเงิน
    if (!q.sent_to_customer_at) return fail("รับเงินได้เฉพาะชุดที่ลูกค้าเลือก");
    // ★ เช็คเด้งหลังงานเดินไปแล้ว (เข้างาน/ปิดงาน · แผน 20261014-03) — ใบงานคงสถานะ แต่ต้องเก็บเงินใหม่ได้
    //   ใบที่ยังไม่ถึงหน้างาน (รอยืนยันนัด/นัดแล้ว) ถูกดึงกลับขั้นชำระเงินตอนกดเช็คเด้งอยู่แล้ว
    const repay = OM_REPAY_AFTER_BOUNCE.includes(q.job_status) && !!q.bounced;
    if (q.job_status !== "payment" && !repay) return fail("ใบงานยังไม่อยู่ขั้นชำระเงิน — กรุณาส่งใบเสนอราคาให้ลูกค้าก่อน");
    // เงินก้อนเดียวเต็มจำนวน — กันยอดพิมพ์ผิดแบบเดียวกับที่ฝั่งขายเคยเจอ (lead 686)
    if (Math.round(amount * 100) !== Math.round(Number(q.total) * 100))
      return fail(`ยอดไม่ตรงกับใบเสนอราคา — ต้องเป็น ${Number(q.total).toLocaleString("th-TH")} บาท`, 400);
    const slipField = omSlipField(qid);
    const dup = (await new sql.Request(tx).input("l", sql.Int, q.lead_id).input("sf", sql.NVarChar(50), slipField)
      .query(`SELECT TOP 1 id, confirmed_at FROM payments p WITH (UPDLOCK, HOLDLOCK)
               WHERE p.lead_id = @l AND p.slip_field = @sf AND ${OM_PAY_LIVE_SQL("p")}`)).recordset[0];
    if (dup) return fail(dup.confirmed_at ? "ใบนี้รับเงินครบแล้ว" : "มีสลิปที่รอฝ่ายบัญชียืนยันอยู่แล้ว — กรุณารอผลก่อน");

    // บัตรเครดิต: ค่าธรรมเนียมคิดจากยอดใบ ปัดเป็นบาท แบบ OrderStep (Math.round(amount * pct / 100))
    const ccFee = cc ? Math.round((Number(q.total) * ccPct) / 100) : 0;
    const cols = ["lead_id", "step_no", "slip_field", "doc_no", "amount", "description", "payment_method", "submitted_by", "submitted_at",
                  "cc_surcharge_pct", "cc_surcharge_amount"];
    const vals = ["@l", "@step", "@sf", "@doc", "@amt", "@desc", "@m", "@u", "GETDATE()", "@ccp", "@cca"];
    const rq = new sql.Request(tx)
      .input("l", sql.Int, q.lead_id).input("step", sql.Int, OM_PAY_STEP_NO).input("sf", sql.NVarChar(50), slipField)
      .input("doc", sql.NVarChar(50), q.doc_no).input("amt", sql.Decimal(12, 2), Number(q.total))
      .input("desc", sql.NVarChar(200), `ค่าบริการ O&M ${q.doc_no}${note ? ` · ${method === "other" ? "ชำระโดย: " : ""}${note}` : ""}`.slice(0, 200))
      .input("m", sql.NVarChar(20), cc ? "cc" : method).input("u", sql.Int, gate.userId)
      .input("ccp", sql.Decimal(5, 2), cc ? ccPct : null).input("cca", sql.Decimal(12, 2), cc ? ccFee : null);
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
      title: method === "cheque" ? `[O&M] ค่าบริการ ${q.doc_no} รอยืนยันรับเช็ค` : `[O&M] ค่าบริการ ${q.doc_no} รอยืนยันรับเงิน`,
      message: `${q.customer_name} · ${(Number(q.total) + ccFee).toLocaleString("th-TH")} บาท${cc ? ` (รวมค่าธรรมเนียมบัตร ${ccPct}%)` : ""}`,
      createdBy: gate.userId,
    });
    await logBooking(tx, {
      bookingId: q.om_booking_id, houseId: q.house_id, action: "pay_submit", actorUserId: gate.userId,
      to: { payment_id: paymentId, amount: Number(q.total), method: cc ? "cc" : method, files: files.length,
            ...(cc ? { cc_pct: ccPct, cc_fee: ccFee } : {}) }, reason: note,
    });
    await tx.commit();
    return NextResponse.json({ ok: true, id: paymentId });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    return NextResponse.json({ error: omErrorText(e, "บันทึกสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "POST /api/om/payments") }, { status: 500 });
  }
}
