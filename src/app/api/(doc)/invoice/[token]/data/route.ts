import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";

// Data for the unified payment-request document (ใบแจ้งชำระเงิน).
// Looked up via the lead's pre_pay_token so the URL never exposes lead_id or amount.

// Mirror of POST /api/leads/[id]/book's doc_no logic, but only the doc_no
// portion (no package/price requirement). Called inline if a lead reaches the
// invoice page without yet having a booking number — we mint one and save it
// back so the invoice's reference is stable across reloads.
async function ensureBookingDocNo(db: Awaited<ReturnType<typeof getDb>>, leadId: number): Promise<string> {
  const cfg = await db.request().query(`
    SELECT [key], value FROM app_settings WHERE [key] IN ('doc_prefix_booking', 'doc_digits_booking')
  `);
  const cfgMap: Record<string, string> = {};
  for (const r of cfg.recordset) cfgMap[r.key] = r.value;
  const prefix = (cfgMap["doc_prefix_booking"] || "SM").replace(/[^A-Z0-9]/gi, "").toUpperCase() || "SM";
  const digits = Math.max(3, Math.min(5, parseInt(cfgMap["doc_digits_booking"] || "3") || 3));
  const year = new Date().getFullYear().toString().slice(-2);
  const maxRes = await db.request()
    .input("like", sql.NVarChar(20), `${prefix}-${year}%`)
    .query(`
      SELECT MAX(CAST(RIGHT(pre_doc_no, ${digits}) AS INT)) AS max_num
      FROM leads WHERE pre_doc_no LIKE @like
    `);
  const nextNum = ((maxRes.recordset[0].max_num || 0) + 1).toString().padStart(digits, "0");
  const docNo = `${prefix}-${year}${nextNum}`;
  await db.request()
    .input("id", sql.Int, leadId)
    .input("doc_no", sql.NVarChar(20), docNo)
    .query(`UPDATE leads SET pre_doc_no = @doc_no, updated_at = GETDATE() WHERE id = @id AND pre_doc_no IS NULL`);
  return docNo;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 10) return NextResponse.json({ error: "invalid token" }, { status: 404 });
  try {
    const db = await getDb();
    const r = await db.request().input("token", sql.NVarChar(64), token).query(`
      SELECT l.id, l.full_name, l.phone, l.installation_address, l.id_card_address, l.id_card_number,
             l.survey_date, l.survey_time_slot, l.install_date, l.install_actual_date, l.install_completed_at,
             l.interested_package_ids, l.interested_package_id,
             l.contact_date, l.created_at, l.pre_pay_amount, l.pre_pay_description, l.pre_pay_installment, l.status,
             l.pre_doc_no,
             pr.name as project_name
      FROM leads l
      LEFT JOIN projects pr ON l.project_id = pr.id
      WHERE l.pre_pay_token = @token
    `);
    if (r.recordset.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
    const l = r.recordset[0];

    // Pre-survey (status=pre_survey): show all interested packages. Later steps: show the chosen one.
    const isPreSurvey = l.status === "pre_survey";
    const pkgIds = isPreSurvey
      ? (l.interested_package_ids ? l.interested_package_ids.split(",").map(Number).filter(Boolean) : (l.interested_package_id ? [l.interested_package_id] : []))
      : (l.interested_package_id ? [l.interested_package_id] : []);

    let packages: { id: number; name: string; kwp: number; price: number }[] = [];
    if (pkgIds.length > 0) {
      const pkgResult = await db.request().query(
        `SELECT id, name, kwp, price FROM packages WHERE id IN (${pkgIds.join(",")}) ORDER BY kwp`
      );
      packages = pkgResult.recordset;
    }

    const amount = l.pre_pay_amount != null ? Number(l.pre_pay_amount) : 0;

    // Look up the pending payment intent for this pre-survey deposit so the
    // QR on the invoice carries the same per-payment Ref2 as the QR shown on
    // screen. Mirrors PreSurveyStep's slipField + stepNo.
    const intentRes = await db.request()
      .input("lead_id", sql.Int, l.id)
      .query(`
        SELECT TOP 1 payment_no FROM payments
        WHERE lead_id = @lead_id AND step_no = 1 AND slip_field = 'pre_slip_url'
          AND confirmed_at IS NULL
        ORDER BY id DESC
      `);
    const paymentNo = intentRes.recordset[0]?.payment_no || null;

    // Use the booking number (pre_doc_no) as the invoice reference. If the
    // lead hasn't been booked yet, mint one now and persist it so the same
    // number sticks for the actual booking confirmation later.
    let docNo: string = l.pre_doc_no;
    if (!docNo) docNo = await ensureBookingDocNo(db, l.id);

    return NextResponse.json({
      ...fixDates([l])[0],
      amount,
      description: l.pre_pay_description || "",
      installment: l.pre_pay_installment || "",
      packages,
      is_pre_survey: isPreSurvey,
      reference_no: docNo,
      step_no: 1,
      payment_no: paymentNo,
    });
  } catch (error) {
    console.error("Invoice data error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
