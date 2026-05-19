import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// Aggregations for the experimental admin-only Dashboard-Dev page.
// Returns chart-ready buckets so the client can render without further math.
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();

    const [funnel, daily, sources, lostReasons, contactStatus, contactOutcomes, contactRecency, financeBreakdown, interestReasons, interestedCount, undecidedReasons] = await Promise.all([
      // Funnel — cumulative stages matching main dashboard's KPI cards.
      // Each stage = leads who reached this point (left→right narrows).
      //   total      = total leads
      //   contacted  = booking_paid OR any contact state = 'yes' (excl. lost)
      //                — same as Leads card "ติดต่อได้" chip
      //   booked     = booking_paid (= ชำระจองสำรวจ chip / Row 2 total)
      //   surveyed   = past survey phase (status quote/order/install/.../closed)
      //   quoted     = past quote phase  (status order/install/.../closed)
      //   installed  = install_completed_at IS NOT NULL
      db.request().query(`
        WITH contact_per_act AS (
          SELECT la.lead_id,
            CASE
              WHEN la.title LIKE N'ติดต่อไม่ได้%' THEN 'no'
              WHEN la.title LIKE N'ติดต่อได้%' THEN 'yes'
              WHEN la.activity_type IN ('call','visit','line','line_sent','loan_followup') THEN 'yes'
              ELSE NULL
            END as state
          FROM lead_activities la
          WHERE la.activity_type IN ('call','visit','line','other','follow_up','loan_followup','line_sent')
        ),
        per_lead AS (
          SELECT lead_id, MAX(CASE WHEN state='yes' THEN 1 ELSE 0 END) as has_yes
          FROM contact_per_act GROUP BY lead_id
        ),
        lead_paid AS (
          SELECT DISTINCT lead_id FROM payments
          WHERE slip_field = 'pre_slip_url' AND confirmed_at IS NOT NULL
        )
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN l.status <> 'lost' AND (lp.lead_id IS NOT NULL OR ISNULL(pl.has_yes, 0) = 1) THEN 1 ELSE 0 END) as contacted,
          SUM(CASE WHEN lp.lead_id IS NOT NULL THEN 1 ELSE 0 END) as booked,
          SUM(CASE WHEN l.status IN ('quote','order','install','warranty','gridtie','closed') THEN 1 ELSE 0 END) as surveyed,
          SUM(CASE WHEN l.status IN ('order','install','warranty','gridtie','closed') THEN 1 ELSE 0 END) as quoted,
          SUM(CASE WHEN l.install_completed_at IS NOT NULL THEN 1 ELSE 0 END) as installed,
          SUM(CASE WHEN l.status = 'lost' THEN 1 ELSE 0 END) as total_lost
        FROM leads l
        LEFT JOIN per_lead pl ON pl.lead_id = l.id
        LEFT JOIN lead_paid lp ON lp.lead_id = l.id
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
      // Per-source quality breakdown: counts at each milestone so the chart
      // can show which channel produces leads that actually convert.
      //   booked     = pre_slip_url confirmed (ชำระจองสำรวจ)
      //   paid       = any order_installment_% confirmed (จ่ายมัดจำ/งวด)
      //   installed  = install_completed_at IS NOT NULL (ติดตั้งเสร็จ)
      // Booked/paid lookups use LEFT JOIN on DISTINCT lead_id derived tables
      // — MSSQL won't allow SUM(CASE WHEN EXISTS(subquery)).
      db.request().query(`
        SELECT
          ISNULL(l.source, '(ไม่ระบุ)') as source,
          COUNT(*) as cnt,
          SUM(CASE WHEN bp.lead_id IS NOT NULL THEN 1 ELSE 0 END) as booked,
          SUM(CASE WHEN op.lead_id IS NOT NULL THEN 1 ELSE 0 END) as paid,
          SUM(CASE WHEN l.install_completed_at IS NOT NULL THEN 1 ELSE 0 END) as installed
        FROM leads l
        LEFT JOIN (
          SELECT DISTINCT lead_id FROM payments
          WHERE slip_field = 'pre_slip_url' AND confirmed_at IS NOT NULL
        ) bp ON bp.lead_id = l.id
        LEFT JOIN (
          SELECT DISTINCT lead_id FROM payments
          WHERE slip_field LIKE 'order_installment_%' AND confirmed_at IS NOT NULL
        ) op ON op.lead_id = l.id
        GROUP BY l.source
        ORDER BY cnt DESC
      `),
      db.request().query(`
        SELECT lost_reason as reason, COUNT(*) as cnt
        FROM leads
        WHERE status = 'lost' AND lost_reason IS NOT NULL AND lost_reason <> ''
        GROUP BY lost_reason
        ORDER BY cnt DESC
      `),
      // Contact status — aligned with main dashboard's Leads card chips (3
      // active buckets, excluding lost since lost is shown elsewhere).
      // Same lead_activities-based logic: title prefix "ติดต่อได้/ไม่ได้"
      // outranks activity_type, booking_paid_at overrides any state.
      db.request().query(`
        WITH contact_per_act AS (
          SELECT la.lead_id,
            CASE
              WHEN la.title LIKE N'ติดต่อไม่ได้%' THEN 'no'
              WHEN la.title LIKE N'ติดต่อได้%' THEN 'yes'
              WHEN la.activity_type IN ('call','visit','line','line_sent','loan_followup') THEN 'yes'
              ELSE NULL
            END as state
          FROM lead_activities la
          WHERE la.activity_type IN ('call','visit','line','other','follow_up','loan_followup','line_sent')
        ),
        per_lead AS (
          SELECT lead_id,
            MAX(CASE WHEN state='yes' THEN 1 ELSE 0 END) as has_yes,
            MAX(CASE WHEN state='no'  THEN 1 ELSE 0 END) as has_no
          FROM contact_per_act GROUP BY lead_id
        ),
        lead_paid AS (
          SELECT DISTINCT lead_id FROM payments
          WHERE slip_field = 'pre_slip_url' AND confirmed_at IS NOT NULL
        )
        SELECT bucket, COUNT(*) as cnt FROM (
          SELECT
            CASE
              WHEN l.status = 'lost' THEN 'lost'
              WHEN lp.lead_id IS NOT NULL OR ISNULL(pl.has_yes, 0) = 1 THEN 'contacted'
              WHEN ISNULL(pl.has_no, 0) = 1 AND ISNULL(pl.has_yes, 0) = 0 THEN 'no_contact'
              ELSE 'never_contacted'
            END as bucket
          FROM leads l
          LEFT JOIN per_lead pl ON pl.lead_id = l.id
          LEFT JOIN lead_paid lp ON lp.lead_id = l.id
        ) x
        GROUP BY bucket
      `),
      // Contact outcomes — 4 mutually-exclusive destinations matching main
      // dashboard's "ติดต่อได้ — ปลายทาง" card. Operates on contacted leads
      // (booking_paid OR has 'yes' state, excluding lost).
      //   1_no_pitch     = pre_survey + no sales_pitch_at + no slip uploaded
      //   2_in_pitch     = pre_survey + has sales_pitch_at + no slip uploaded
      //   3_slip_pending = pre_survey-01 OR (pre_survey + slip uploaded)
      //   4_booked       = booking_paid (= ชำระจองสำรวจ — same as funnel)
      db.request().query(`
        WITH contact_per_act AS (
          SELECT la.lead_id,
            CASE
              WHEN la.title LIKE N'ติดต่อไม่ได้%' THEN 'no'
              WHEN la.title LIKE N'ติดต่อได้%' THEN 'yes'
              WHEN la.activity_type IN ('call','visit','line','line_sent','loan_followup') THEN 'yes'
              ELSE NULL
            END as state
          FROM lead_activities la
          WHERE la.activity_type IN ('call','visit','line','other','follow_up','loan_followup','line_sent')
        ),
        per_lead AS (
          SELECT lead_id, MAX(CASE WHEN state='yes' THEN 1 ELSE 0 END) as has_yes
          FROM contact_per_act GROUP BY lead_id
        ),
        lead_paid AS (
          SELECT DISTINCT lead_id FROM payments
          WHERE slip_field = 'pre_slip_url' AND confirmed_at IS NOT NULL
        ),
        lead_pitch AS (
          SELECT DISTINCT lead_id FROM lead_activities
          WHERE title LIKE N'%เสนอขาย%'
        ),
        lead_slip_submitted AS (
          SELECT DISTINCT lead_id FROM payments
          WHERE slip_field = 'pre_slip_url' AND submitted_at IS NOT NULL
        ),
        lead_slip_uploaded AS (
          SELECT DISTINCT lead_id FROM slip_files WHERE slip_field = 'pre_slip_url'
          UNION
          SELECT lead_id FROM lead_slip_submitted
        ),
        contacted AS (
          SELECT l.id, l.status,
            CASE WHEN lp_paid.lead_id IS NOT NULL THEN 1 ELSE 0 END as is_paid,
            CASE WHEN lp_pitch.lead_id IS NOT NULL OR lp_ss.lead_id IS NOT NULL THEN 1 ELSE 0 END as has_pitch,
            CASE WHEN lp_su.lead_id IS NOT NULL THEN 1 ELSE 0 END as has_slip
          FROM leads l
          LEFT JOIN per_lead pl  ON pl.lead_id = l.id
          LEFT JOIN lead_paid lp_paid ON lp_paid.lead_id = l.id
          LEFT JOIN lead_pitch lp_pitch ON lp_pitch.lead_id = l.id
          LEFT JOIN lead_slip_submitted lp_ss ON lp_ss.lead_id = l.id
          LEFT JOIN lead_slip_uploaded lp_su ON lp_su.lead_id = l.id
          WHERE l.status <> 'lost'
            AND (lp_paid.lead_id IS NOT NULL OR ISNULL(pl.has_yes, 0) = 1)
        )
        SELECT stage, COUNT(*) as cnt FROM (
          SELECT CASE
            WHEN is_paid = 1 THEN '4_booked'
            WHEN status = 'pre_survey-01' OR (status = 'pre_survey' AND has_slip = 1) THEN '3_slip_pending'
            WHEN status = 'pre_survey' AND has_pitch = 1 THEN '2_in_pitch'
            WHEN status = 'pre_survey' AND has_pitch = 0 AND has_slip = 0 THEN '1_no_pitch'
            ELSE '4_booked'
          END as stage
          FROM contacted
        ) x
        GROUP BY stage
        ORDER BY stage
      `),
      // Contact recency — days since last contact event. "Contact" matches
      // contact_status: call/visit/line/follow_up/... contact attempts OR
      // a confirmed booking deposit (booking_paid_at override). That way
      // "5_never" here = "never_contacted" in contact_status exactly.
      db.request().query(`
        WITH active AS (
          SELECT * FROM leads WHERE status <> 'lost'
        ),
        last_contact AS (
          SELECT lead_id, MAX(created_at) as last_at
          FROM lead_activities
          WHERE activity_type IN ('call','visit','line','other','follow_up','loan_followup','line_sent')
          GROUP BY lead_id
        ),
        booking_paid AS (
          SELECT lead_id, MIN(confirmed_at) as paid_at
          FROM payments
          WHERE slip_field = 'pre_slip_url' AND confirmed_at IS NOT NULL
          GROUP BY lead_id
        ),
        last_any AS (
          SELECT a.id,
            CASE
              WHEN lc.last_at IS NOT NULL AND bp.paid_at IS NOT NULL
                THEN CASE WHEN lc.last_at > bp.paid_at THEN lc.last_at ELSE bp.paid_at END
              WHEN lc.last_at IS NOT NULL THEN lc.last_at
              ELSE bp.paid_at
            END as last_at
          FROM active a
          LEFT JOIN last_contact lc ON lc.lead_id = a.id
          LEFT JOIN booking_paid bp ON bp.lead_id = a.id
        )
        SELECT bucket, COUNT(*) as cnt FROM (
          SELECT
            CASE
              WHEN last_at IS NULL THEN '5_never'
              WHEN DATEDIFF(day, last_at, GETDATE()) <= 1 THEN '1_today'
              WHEN DATEDIFF(day, last_at, GETDATE()) <= 7 THEN '2_week'
              WHEN DATEDIFF(day, last_at, GETDATE()) <= 30 THEN '3_month'
              ELSE '4_over_month'
            END as bucket
          FROM last_any
        ) x
        GROUP BY bucket
        ORDER BY bucket
      `),
      // Finance breakdown — cash/transfer vs สินเชื่อ split by bank.
      // Scoped to leads with at least one confirmed payment (ยืนยัน 2) so the
      // chart reflects leads who actually committed to a payment method.
      db.request().query(`
        SELECT bucket, COUNT(*) as cnt FROM (
          SELECT
            CASE
              WHEN payment_type = N'สินเชื่อ' OR payment_type LIKE '%finance%' OR payment_type LIKE '%loan%'
                THEN N'สินเชื่อ - ' + ISNULL(NULLIF(finance_bank, ''), N'ไม่ระบุธนาคาร')
              ELSE N'เงินสด/โอน'
            END as bucket
          FROM leads l
          WHERE EXISTS (
            SELECT 1 FROM payments p
            WHERE p.lead_id = l.id AND p.confirmed_at IS NOT NULL
          )
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
        total:     f.total,
        contacted: f.contacted,
        booked:    f.booked,
        surveyed:  f.surveyed,
        quoted:    f.quoted,
        installed: f.installed,
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
