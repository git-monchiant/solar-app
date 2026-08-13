import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, toSqlDate } from "@/lib/db";
import { flipJourneyDatesIfDue } from "@/lib/journey";
import { requireAuth } from "@/lib/auth";

// Aggregations for the experimental admin-only Dashboard-Dev page.
// Returns chart-ready buckets so the client can render without further math.
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    await flipJourneyDatesIfDue(db);

    // Mirrors /api/dashboard's global filter — see eligibleSet there for the
    // semantics of created vs activity mode. Same composed-WHERE pattern so
    // bumping mode/filter logic only needs one place.
    const fromYmd = req.nextUrl.searchParams.get("from") || "";
    const toYmd   = req.nextUrl.searchParams.get("to")   || "";
    const modeIn  = req.nextUrl.searchParams.get("mode") || "created";
    const mode: "created" | "activity" = modeIn === "activity" ? "activity" : "created";
    const fromDate = toSqlDate(fromYmd);
    const toDate   = toSqlDate(toYmd);
    const hasRange = !!fromDate && !!toDate;
    const bindRange = (r: ReturnType<typeof db.request>) => {
      if (fromDate) r.input("from", sql.Date, fromDate);
      if (toDate)   r.input("to",   sql.Date, toDate);
      return r;
    };
    const eligibleSet = !hasRange
      ? "SELECT id FROM leads"
      : mode === "created"
      ? "SELECT id FROM leads WHERE CAST(created_at AS DATE) BETWEEN @from AND @to"
      : `SELECT id FROM leads l WHERE
            CAST(l.created_at AS DATE) BETWEEN @from AND @to
            OR CAST(l.survey_date AS DATE) BETWEEN @from AND @to
            OR CAST(l.install_date AS DATE) BETWEEN @from AND @to
            OR CAST(l.install_completed_at AS DATE) BETWEEN @from AND @to
            OR EXISTS (
              SELECT 1 FROM payments p WHERE p.lead_id = l.id
                AND p.confirmed_at IS NOT NULL
                AND CAST(p.confirmed_at AS DATE) BETWEEN @from AND @to
            )
            OR EXISTS (
              SELECT 1 FROM lead_activities a WHERE a.lead_id = l.id
                AND CAST(a.created_at AS DATE) BETWEEN @from AND @to
            )`;

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
      // Funnel จากคอลัมน์ journey ที่ persist ไว้ (นิยาม "ติดต่อได้" อันเดียวกับ
      // dashboard หลักแล้ว: ติดต่อได้ยังไม่สะดวกคุย/ระหว่างเสนอ (130,140) หรือเดิน
      // มาถึงขั้นจอง (200) ขึ้นไป). booked = จองยืนยันแล้ว (220) หรือขั้นถัดไป —
      // นับรวมจองแบบฟรีค่าสำรวจด้วย (เดิมนับจาก payments อย่างเดียวเลยตกหล่น)
      bindRange(db.request()).query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN l.journey_sub IN (130, 140) OR l.journey_step BETWEEN 200 AND 1000 THEN 1 ELSE 0 END) as contacted,
          SUM(CASE WHEN l.journey_sub = 220 OR l.journey_step BETWEEN 300 AND 1000 THEN 1 ELSE 0 END) as booked,
          SUM(CASE WHEN l.journey_step BETWEEN 400 AND 1000 THEN 1 ELSE 0 END) as surveyed,
          SUM(CASE WHEN l.journey_step BETWEEN 500 AND 1000 THEN 1 ELSE 0 END) as quoted,
          SUM(CASE WHEN l.install_completed_at IS NOT NULL THEN 1 ELSE 0 END) as installed,
          SUM(CASE WHEN l.journey_step = 9900 THEN 1 ELSE 0 END) as total_lost
        FROM leads l
        WHERE l.id IN (${eligibleSet})
      `),
      // Daily new leads — when a filter range is set, scope to that range so
      // the chart matches the global filter. With no range, falls back to the
      // 30-day rolling window for the "เมื่อเร็วๆ นี้" snapshot.
      bindRange(db.request()).query(`
        SELECT CONVERT(varchar, created_at, 23) as day,
          SUM(CASE WHEN line_id IS NOT NULL AND line_id <> '' THEN 1 ELSE 0 END) as with_line,
          SUM(CASE WHEN line_id IS NULL OR line_id = '' THEN 1 ELSE 0 END) as without_line,
          COUNT(*) as cnt
        FROM leads
        WHERE ${hasRange
          ? "id IN (" + eligibleSet + ")"
          : "created_at >= DATEADD(day, -29, CAST(GETDATE() AS date))"}
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
      bindRange(db.request()).query(`
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
        WHERE l.id IN (${eligibleSet})
        GROUP BY l.source
        ORDER BY cnt DESC
      `),
      bindRange(db.request()).query(`
        SELECT lost_reason as reason, COUNT(*) as cnt
        FROM leads
        WHERE status = 'lost' AND lost_reason IS NOT NULL AND lost_reason <> ''
          AND id IN (${eligibleSet})
        GROUP BY lost_reason
        ORDER BY cnt DESC
      `),
      // Contact status — อ่านตรงจาก journey (110/120/130/140 คือ funnel การติดต่อ
      // ที่ persist แล้ว) · ส่งกลับ Seeker (9800) นับรวมใน lost เพราะออกจาก
      // pipeline เหมือนกัน
      bindRange(db.request()).query(`
        SELECT bucket, COUNT(*) as cnt FROM (
          SELECT
            CASE
              WHEN l.journey_step IN (9800, 9900) THEN 'lost'
              WHEN l.journey_sub IN (130, 140) OR l.journey_step BETWEEN 200 AND 1000 THEN 'contacted'
              WHEN l.journey_sub = 120 THEN 'no_contact'
              ELSE 'never_contacted'
            END as bucket
          FROM leads l
          WHERE l.id IN (${eligibleSet})
        ) x
        GROUP BY bucket
      `),
      // Contact outcomes — ปลายทางของ lead ที่ติดต่อได้ อ่านตรงจาก journey:
      //   1_no_pitch     = 130 ยังไม่สะดวกคุย
      //   2_in_pitch     = 140 ระหว่างเสนอขาย
      //   3_slip_pending = 210 จอง รอยืนยันเงิน
      //   4_booked       = 220 จองแล้ว หรือขั้นถัดไป (300..1000)
      bindRange(db.request()).query(`
        SELECT stage, COUNT(*) as cnt FROM (
          SELECT CASE
            WHEN l.journey_sub = 220 OR l.journey_step BETWEEN 300 AND 1000 THEN '4_booked'
            WHEN l.journey_sub = 210 THEN '3_slip_pending'
            WHEN l.journey_sub = 140 THEN '2_in_pitch'
            ELSE '1_no_pitch'
          END as stage
          FROM leads l
          WHERE (l.journey_sub IN (130, 140) OR l.journey_step BETWEEN 200 AND 1000)
            AND l.id IN (${eligibleSet})
        ) x
        GROUP BY stage
        ORDER BY stage
      `),
      // Contact recency — days since last contact event. "Contact" matches
      // contact_status: call/visit/line/follow_up/... contact attempts OR
      // a confirmed booking deposit (booking_paid_at override). That way
      // "5_never" here = "never_contacted" in contact_status exactly.
      bindRange(db.request()).query(`
        WITH active AS (
          SELECT * FROM leads WHERE status <> 'lost' AND id IN (${eligibleSet})
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
      bindRange(db.request()).query(`
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
          AND l.id IN (${eligibleSet})
        ) x
        GROUP BY bucket
        ORDER BY bucket
      `),
      // Interest reasons — explode CSV from prospects.interest_reasons.
      // Only count "interested" prospects (skip undecided / not_interested / not_home / null).
      // Scoped to the global filter range when set: prospects don't have a
      // lifecycle so we filter on their created_at (regardless of mode).
      bindRange(db.request()).query(`
        SELECT TRIM(value) as code, COUNT(*) as cnt
        FROM prospects
        CROSS APPLY STRING_SPLIT(interest_reasons, ',')
        WHERE interest_reasons IS NOT NULL AND interest_reasons <> ''
          AND interest = 'interested'
          ${hasRange ? "AND CAST(created_at AS DATE) BETWEEN @from AND @to" : ""}
        GROUP BY TRIM(value)
        ORDER BY cnt DESC
      `),
      // Total "interested" prospects — used as denominator on the chart header
      bindRange(db.request()).query(`
        SELECT COUNT(*) as cnt FROM prospects
        WHERE interest = 'interested'
        ${hasRange ? "AND CAST(created_at AS DATE) BETWEEN @from AND @to" : ""}
      `),
      // Undecided reasons — for active pre_survey leads (not booked, not lost)
      // Include NULL bucket as "ไม่ระบุเหตุผล" so total reflects all not-booked.
      bindRange(db.request()).query(`
        SELECT
          ISNULL(NULLIF(undecided_reason, N''), N'ไม่ระบุเหตุผล') as reason,
          COUNT(*) as cnt
        FROM leads
        WHERE status = 'pre_survey' AND pre_doc_no IS NULL
          AND id IN (${eligibleSet})
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
