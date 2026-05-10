import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

// Aggregations for the experimental admin-only Dashboard-Dev page.
// Returns chart-ready buckets so the client can render without further math.
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();

    const [funnel, daily, sources, lostReasons, contactStatus, contactOutcomes, contactRecency, financeBreakdown, interestReasons, interestedCount, undecidedReasons] = await Promise.all([
      db.request().query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN pre_doc_no IS NOT NULL THEN 1 ELSE 0 END) as has_pre_doc,
          SUM(CASE WHEN survey_date IS NOT NULL THEN 1 ELSE 0 END) as has_survey,
          SUM(CASE WHEN order_total IS NOT NULL THEN 1 ELSE 0 END) as has_order,
          SUM(CASE WHEN install_date IS NOT NULL THEN 1 ELSE 0 END) as has_install,
          SUM(CASE WHEN install_completed_at IS NOT NULL THEN 1 ELSE 0 END) as installed,
          SUM(CASE WHEN warranty_issued_at IS NOT NULL THEN 1 ELSE 0 END) as warranty_issued,
          SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as total_lost
        FROM leads
      `),
      db.request().query(`
        SELECT CONVERT(varchar, created_at, 23) as day,
          SUM(CASE WHEN line_id IS NOT NULL AND line_id <> '' THEN 1 ELSE 0 END) as with_line,
          SUM(CASE WHEN line_id IS NULL OR line_id = '' THEN 1 ELSE 0 END) as without_line,
          COUNT(*) as cnt
        FROM leads
        WHERE created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))
        GROUP BY CONVERT(varchar, created_at, 23)
        ORDER BY day
      `),
      db.request().query(`
        SELECT ISNULL(source, '(ไม่ระบุ)') as source, COUNT(*) as cnt
        FROM leads
        GROUP BY source
        ORDER BY cnt DESC
      `),
      db.request().query(`
        SELECT lost_reason as reason, COUNT(*) as cnt
        FROM leads
        WHERE status = 'lost' AND lost_reason IS NOT NULL AND lost_reason <> ''
        GROUP BY lost_reason
        ORDER BY cnt DESC
      `),
      // Contact status — active leads only (excl. lost/closed/returned)
      // Buckets: contacted / never_contacted / no_contact
      db.request().query(`
        WITH active AS (
          SELECT id, note, pre_doc_no, survey_date,
            CASE WHEN EXISTS (SELECT 1 FROM lead_activities la WHERE la.lead_id = leads.id AND la.activity_type IN ('call','note','appointment_set','appointment_confirmed','line_sent','line','visit')) THEN 1 ELSE 0 END as has_contact_act
          FROM leads
          WHERE status NOT IN ('lost','closed','returned')
        ),
        labeled AS (
          SELECT
            CASE
              WHEN note LIKE '%สถานะจาก sheet: 13.%' OR note LIKE '%สถานะจาก sheet: 14.%' THEN 'no_contact'
              WHEN pre_doc_no IS NOT NULL OR survey_date IS NOT NULL THEN 'contacted'
              WHEN note LIKE '%สถานะจาก sheet: 2.%' OR note LIKE '%สถานะจาก sheet: 3.%' OR note LIKE '%สถานะจาก sheet: 4.%' OR note LIKE '%สถานะจาก sheet: 5.%' OR note LIKE '%สถานะจาก sheet: 6.%' OR note LIKE '%สถานะจาก sheet: 7.%' OR note LIKE '%สถานะจาก sheet: 8.%' OR note LIKE '%สถานะจาก sheet: 9.%' OR note LIKE '%สถานะจาก sheet: 10.%' OR note LIKE '%สถานะจาก sheet: 11.%' THEN 'contacted'
              WHEN has_contact_act = 1 THEN 'contacted'
              ELSE 'never_contacted'
            END as bucket
          FROM active
        )
        SELECT bucket, COUNT(*) as cnt FROM labeled GROUP BY bucket
      `),
      // Within "contacted" — what stage are they at? Grouped into 5 buckets.
      db.request().query(`
        WITH contacted AS (
          SELECT * FROM leads
          WHERE status NOT IN ('lost','closed','returned')
            AND (
              pre_doc_no IS NOT NULL OR survey_date IS NOT NULL
              OR note LIKE '%สถานะจาก sheet: 2.%' OR note LIKE '%สถานะจาก sheet: 3.%'
              OR note LIKE '%สถานะจาก sheet: 4.%' OR note LIKE '%สถานะจาก sheet: 5.%'
              OR note LIKE '%สถานะจาก sheet: 6.%' OR note LIKE '%สถานะจาก sheet: 7.%'
              OR note LIKE '%สถานะจาก sheet: 8.%' OR note LIKE '%สถานะจาก sheet: 9.%'
              OR note LIKE '%สถานะจาก sheet: 10.%' OR note LIKE '%สถานะจาก sheet: 11.%'
              OR EXISTS (SELECT 1 FROM lead_activities la WHERE la.lead_id = leads.id AND la.activity_type IN ('call','note','appointment_set','appointment_confirmed','line_sent','line','visit'))
            )
        )
        SELECT stage, COUNT(*) as cnt FROM (
          SELECT
            CASE
              WHEN install_completed_at IS NOT NULL THEN '5_installed'
              WHEN status IN ('install','warranty','gridtie') OR install_date IS NOT NULL THEN '5_installed'
              WHEN status = 'order' OR order_total IS NOT NULL THEN '4_order'
              WHEN status = 'quote' OR quotation_amount IS NOT NULL OR status = 'survey' OR survey_actual_date IS NOT NULL THEN '3_survey_quote'
              WHEN survey_date IS NOT NULL OR pre_doc_no IS NOT NULL THEN '2_booked_or_survey_set'
              ELSE '1_contacted_only'
            END as stage
          FROM contacted
        ) x
        GROUP BY stage
        ORDER BY stage
      `),
      // Contact recency — bucket by days since last "real" activity (excl. lead_created)
      db.request().query(`
        WITH active AS (
          SELECT * FROM leads WHERE status NOT IN ('lost','closed','returned')
        ),
        last_act AS (
          SELECT lead_id, MAX(created_at) as last_at
          FROM lead_activities
          WHERE activity_type NOT IN ('lead_created')
          GROUP BY lead_id
        )
        SELECT bucket, COUNT(*) as cnt FROM (
          SELECT
            CASE
              WHEN la.last_at IS NULL THEN '5_never'
              WHEN DATEDIFF(day, la.last_at, GETDATE()) <= 1 THEN '1_today'
              WHEN DATEDIFF(day, la.last_at, GETDATE()) <= 7 THEN '2_week'
              WHEN DATEDIFF(day, la.last_at, GETDATE()) <= 30 THEN '3_month'
              ELSE '4_over_month'
            END as bucket
          FROM active a
          LEFT JOIN last_act la ON la.lead_id = a.id
        ) x
        GROUP BY bucket
        ORDER BY bucket
      `),
      // Finance breakdown — cash/transfer (incl. NULL) vs สินเชื่อ split by bank
      db.request().query(`
        SELECT bucket, COUNT(*) as cnt FROM (
          SELECT
            CASE
              WHEN payment_type = N'สินเชื่อ' OR payment_type LIKE '%finance%' OR payment_type LIKE '%loan%'
                THEN N'สินเชื่อ - ' + ISNULL(NULLIF(finance_bank, ''), N'ไม่ระบุธนาคาร')
              ELSE N'เงินสด/โอน'
            END as bucket
          FROM leads
        ) x
        GROUP BY bucket
        ORDER BY bucket
      `),
      // Interest reasons — explode CSV from prospects.interest_reasons.
      // Only count "interested" prospects (skip undecided / not_interested / not_home / null).
      db.request().query(`
        SELECT TRIM(value) as code, COUNT(*) as cnt
        FROM prospects
        CROSS APPLY STRING_SPLIT(interest_reasons, ',')
        WHERE interest_reasons IS NOT NULL AND interest_reasons <> ''
          AND interest = 'interested'
        GROUP BY TRIM(value)
        ORDER BY cnt DESC
      `),
      // Total "interested" prospects — used as denominator on the chart header
      db.request().query(`
        SELECT COUNT(*) as cnt FROM prospects WHERE interest = 'interested'
      `),
      // Undecided reasons — for active pre_survey leads (not booked, not lost)
      // Include NULL bucket as "ไม่ระบุเหตุผล" so total reflects all not-booked.
      db.request().query(`
        SELECT
          ISNULL(NULLIF(undecided_reason, N''), N'ไม่ระบุเหตุผล') as reason,
          COUNT(*) as cnt
        FROM leads
        WHERE status = 'pre_survey' AND pre_doc_no IS NULL
        GROUP BY ISNULL(NULLIF(undecided_reason, N''), N'ไม่ระบุเหตุผล')
        ORDER BY cnt DESC
      `),
    ]);

    const f = funnel.recordset[0];
    return NextResponse.json({
      funnel: {
        total: f.total,
        has_pre_doc: f.has_pre_doc,
        has_survey: f.has_survey,
        has_order: f.has_order,
        has_install: f.has_install,
        installed: f.installed,
        warranty_issued: f.warranty_issued,
      },
      total_lost: f.total_lost,
      daily: daily.recordset,
      sources: sources.recordset,
      lost_reasons: lostReasons.recordset,
      contact_status: contactStatus.recordset,
      contact_outcomes: contactOutcomes.recordset,
      contact_recency: contactRecency.recordset,
      finance_breakdown: financeBreakdown.recordset,
      interest_reasons: interestReasons.recordset,
      interested_count: interestedCount.recordset[0].cnt,
      undecided_reasons: undecidedReasons.recordset,
    });
  } catch (error) {
    console.error("GET /api/dashboard-dev error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
