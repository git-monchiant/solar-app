import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { mintDocNo } from "@/lib/doc-number";

// Data for the unified payment-request document (ใบแจ้งชำระเงิน).
// Looked up via the lead's pre_pay_token so the URL never exposes lead_id or amount.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token || token.length < 10) return NextResponse.json({ error: "invalid token" }, { status: 404 });
  try {
    const db = await getDb();
    const r = await db.request().input("token", sql.NVarChar(64), token).query(`
      SELECT l.id, l.full_name, l.phone, l.email, l.installation_address, l.id_card_address, l.id_card_number,
             l.survey_date, l.survey_time_slot, l.install_date, l.install_actual_date, l.install_completed_at,
             l.interested_package_ids, l.interested_package_id,
             l.contact_date, l.created_at, l.pre_pay_amount, l.pre_pay_description, l.pre_pay_installment, l.status,
             l.pre_doc_no, l.project_alias, l.pre_pay_payment_id,
             COALESCE(NULLIF(l.project_alias, N''), pr.name) as project_name,
             p.payment_method as pay_method,
             p.discount_pct, p.discount_amount, p.discount_note,
             p.cc_surcharge_pct, p.cc_surcharge_amount
      FROM leads l
      LEFT JOIN projects pr ON l.project_id = pr.id
      LEFT JOIN payments p ON p.id = l.pre_pay_payment_id
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
    let docNo: string | null = l.pre_doc_no;
    if (!docNo) docNo = await mintDocNo(db, l.id, "booking");

    const ccSurchargeAmount = l.cc_surcharge_amount != null ? Number(l.cc_surcharge_amount) : 0;
    const ccSurchargePct = l.cc_surcharge_pct != null ? Number(l.cc_surcharge_pct) : null;
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
      payment_method: l.pay_method || null,
      cc_surcharge_pct: ccSurchargePct,
      cc_surcharge_amount: ccSurchargeAmount,
      total_to_pay: amount + ccSurchargeAmount,
    });
  } catch (error) {
    console.error("Invoice data error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
