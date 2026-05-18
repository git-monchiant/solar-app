import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

// KPI funnel for Dashboard-Dev-2. Each bucket maps to a status (+ sub-state
// check on substep/payment/date columns) so the client just renders numbers.
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    // SQL Server forbids subqueries inside aggregates, so pre-join two
    // boolean flags via LEFT JOIN: (a) has a follow-up activity logged,
    // (b) has a confirmed order installment payment.
    const r = (await db.request().query(`
      WITH lead_flags AS (
        SELECT l.id, l.status, l.undecided_reason, l.lost_reason,
               l.survey_date, l.install_date, l.install_completed_at, l.quotation_amount,
               CASE WHEN act.lead_id IS NULL THEN 0 ELSE 1 END AS has_followup,
               CASE WHEN pay.lead_id IS NULL THEN 0 ELSE 1 END AS has_deposit
        FROM leads l
        LEFT JOIN (
          SELECT DISTINCT lead_id FROM lead_activities
          WHERE activity_type IN ('call','visit','line','other','follow_up','loan_followup')
        ) act ON act.lead_id = l.id
        LEFT JOIN (
          SELECT DISTINCT lead_id FROM payments
          WHERE slip_field LIKE 'order_installment_%' AND confirmed_at IS NOT NULL
        ) pay ON pay.lead_id = l.id
      )
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pre_survey' AND has_followup = 0 THEN 1 ELSE 0 END) AS new_leads,
        SUM(CASE WHEN status = 'pre_survey' AND undecided_reason IS NOT NULL AND undecided_reason <> N'' THEN 1 ELSE 0 END) AS sales_undecided,
        SUM(CASE WHEN status = 'pre_survey-01' THEN 1 ELSE 0 END) AS booking_unpaid,
        SUM(CASE WHEN status = 'pre_survey-02' THEN 1 ELSE 0 END) AS booking_paid,
        SUM(CASE WHEN status IN ('order','install','warranty','gridtie','closed') THEN 1 ELSE 0 END) AS success_total,
        SUM(CASE WHEN status = 'order' AND has_deposit = 1 THEN 1 ELSE 0 END) AS deposit_paid,
        SUM(CASE WHEN status = 'install' AND install_date IS NOT NULL THEN 1 ELSE 0 END) AS install_scheduled,
        SUM(CASE WHEN status IN ('warranty','gridtie','closed') OR install_completed_at IS NOT NULL THEN 1 ELSE 0 END) AS installed,
        SUM(CASE WHEN status = 'lost' AND lost_reason LIKE N'ติดต่อไม่ได้%' THEN 1 ELSE 0 END) AS lost_contact,
        SUM(CASE WHEN status = 'survey' AND survey_date IS NULL THEN 1 ELSE 0 END) AS survey_pending,
        SUM(CASE WHEN status = 'survey' AND survey_date IS NOT NULL THEN 1 ELSE 0 END) AS survey_scheduled,
        SUM(CASE WHEN status = 'quote' AND (quotation_amount IS NULL OR quotation_amount = 0) THEN 1 ELSE 0 END) AS quote_pending,
        SUM(CASE WHEN status = 'quote' AND quotation_amount IS NOT NULL AND quotation_amount > 0 THEN 1 ELSE 0 END) AS quote_sent
      FROM lead_flags
    `)).recordset[0];
    return NextResponse.json(r);
  } catch (err) {
    console.error("dashboard-dev-2 GET error:", err);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
