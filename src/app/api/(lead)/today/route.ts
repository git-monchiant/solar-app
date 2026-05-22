import { NextRequest, NextResponse } from "next/server";
import { getDb, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// LeadCard + today page only read ~30 columns from the leads table. The full
// table is 60-80 cols per row (survey JSON blobs, photo URLs, etc.) so
// SELECT * was sending ~10× the bytes the UI actually used. This focused
// list also resolves project_name once via COALESCE so we don't need to
// flatten duplicate-aliased columns coming back from the mssql driver.
//
// Activity-derived fields (`contact_count`, `last_activity_*`,
// `is_followup_overdue`) come from a single pre-aggregated scan of
// lead_activities joined via `act` + a single TOP-1 OUTER APPLY for the
// most-recent note. This avoids the N+1 correlated-subqueries-per-row
// pattern that previously caused /api/today to time out under any network
// jitter.
const LEAD_COLS = `
  l.id, l.full_name, l.house_number, l.phone, l.email, l.note,
  l.status, l.source, l.customer_type, l.line_id, l.zone,
  l.created_at, l.contact_date, l.next_follow_up,
  l.assigned_user_id, l.installation_address,
  l.pre_doc_no, l.pre_total_price, l.payment_confirmed,
  l.survey_date, l.survey_time_slot,
  l.install_date, l.install_completed_at, l.install_extra_cost,
  l.order_total, l.quotation_amount,
  COALESCE(NULLIF(l.project_name, ''), p.name) as project_name,
  p.district, p.province, pk.name as package_name,
  u.full_name as assigned_name, u.username as assigned_username,
  COALESCE(act.contact_count, 0) AS contact_count,
  last_act.last_activity_date,
  last_act.last_activity_title,
  last_act.last_activity_type,
  last_act.last_activity_note,
  COALESCE(pay.paid_count, 0) AS order_paid_count,
  COALESCE(pay.total_count, 0) AS order_total_count,
  CAST(COALESCE(pay.paid_count, 0) AS NVARCHAR(10))
    + N'/' + CAST(COALESCE(pay.total_count, 0) AS NVARCHAR(10)) AS order_payment_progress,
  CAST(CASE
    WHEN l.next_follow_up IS NOT NULL
     AND l.next_follow_up < CAST(GETDATE() AS DATE)
     AND l.status NOT IN ('install', 'lost')
     AND (act.last_followup_date IS NULL OR act.last_followup_date < l.next_follow_up)
    THEN 1 ELSE 0
  END AS BIT) AS is_followup_overdue
`;

// Shared FROM clause for every today-list query. Two activity joins:
//   `act`      — GROUP BY per lead_id, scans lead_activities once per query
//                (not once per row), gives contact_count + last_followup_date.
//   `last_act` — OUTER APPLY TOP 1 by created_at DESC, returns the most-recent
//                activity's note + display date. With the
//                idx_lead_activities_lead_id_created_at index this is a single
//                seek per row.
const LEAD_FROM = `
  FROM leads l
  LEFT JOIN projects p ON l.project_id = p.id
  LEFT JOIN packages pk ON l.interested_package_id = pk.id
  LEFT JOIN users u ON l.assigned_user_id = u.id
  LEFT JOIN (
    SELECT
      a.lead_id,
      SUM(CASE WHEN a.activity_type IN ('call','visit','line','other','follow_up','loan_followup') THEN 1 ELSE 0 END) AS contact_count,
      MAX(CASE WHEN a.activity_type IN ('call','visit','line','other','follow_up','loan_followup')
               THEN COALESCE(a.followup_date, CAST(a.created_at AS DATE))
          END) AS last_followup_date
    FROM lead_activities a
    GROUP BY a.lead_id
  ) act ON act.lead_id = l.id
  OUTER APPLY (
    SELECT TOP 1
      COALESCE(followup_date, CAST(created_at AS DATE)) AS last_activity_date,
      title AS last_activity_title,
      activity_type AS last_activity_type,
      note AS last_activity_note
    FROM lead_activities
    WHERE lead_id = l.id
      AND activity_type IN ('call', 'visit', 'line', 'other', 'follow_up', 'loan_followup')
    ORDER BY created_at DESC
  ) last_act
  LEFT JOIN (
    SELECT lead_id,
      COUNT(CASE WHEN confirmed_at IS NOT NULL THEN 1 END) AS paid_count,
      COUNT(*) AS total_count
    FROM payments
    WHERE slip_field LIKE 'order_installment_%'
    GROUP BY lead_id
  ) pay ON pay.lead_id = l.id
`;

function fix<T extends Record<string, unknown>>(rs: T[]): T[] {
  return fixDates(rs) as T[];
}

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();

    const [newLeads, overduePreSurvey, followUpToday, followUpOverdue, surveyToday, surveyPending, quotationPending, installPending, followUpUpcoming, waitInstall, installScheduled, warranty, recentlyClosed, booking, stats] = await Promise.all([
      // 1. Lead ใหม่ — pre_survey ที่ยังไม่มี doc และไม่มี follow-up ในอนาคต
      // เคยมี cutoff "อายุ < 2 วัน" แต่ทำให้ lead ที่ import จากชีต (ส่วนใหญ่ > 2 วัน) ตกจากกอง
      db.request().query(`
        SELECT ${LEAD_COLS}
        ${LEAD_FROM}
        WHERE l.status = 'pre_survey'
          AND l.pre_doc_no IS NULL
          AND (l.next_follow_up IS NULL OR CAST(l.next_follow_up AS DATE) < CAST(GETDATE() AS DATE))
        ORDER BY l.created_at DESC
      `),
      // 2. (deprecated — รวมกับ newLeads แล้ว)
      db.request().query(`SELECT TOP 0 * FROM leads`),
      // 3. นัดติดตามวันนี้
      db.request().query(`
        SELECT ${LEAD_COLS}
        ${LEAD_FROM}
        WHERE l.next_follow_up = CAST(GETDATE() AS DATE)
          AND l.status NOT IN ('install', 'lost')
        ORDER BY COALESCE(l.contact_date, l.created_at) ASC
      `),
      // 4. เลยกำหนดติดตาม (overdue follow-up).
      // Drop a lead from overdue once any follow_up activity is logged on/after
      // the scheduled date — derived via `act.last_followup_date` in LEAD_COLS,
      // so the filter is a simple comparison instead of NOT EXISTS.
      db.request().query(`
        SELECT ${LEAD_COLS}
        ${LEAD_FROM}
        WHERE l.next_follow_up < CAST(GETDATE() AS DATE)
          AND l.status NOT IN ('install', 'lost')
          AND (act.last_followup_date IS NULL OR act.last_followup_date < l.next_follow_up)
        ORDER BY COALESCE(l.contact_date, l.created_at) ASC
      `),
      // 5. Survey วันนี้
      db.request().query(`
        SELECT ${LEAD_COLS}
        ${LEAD_FROM}
        WHERE l.status = 'survey' AND l.survey_date = CAST(GETDATE() AS DATE)
        ORDER BY l.survey_time_slot ASC
      `),
      // 6. Survey รอดำเนินการ (ทั้งหมดที่ยังไม่เสร็จ ยกเว้นวันนี้)
      db.request().query(`
        SELECT ${LEAD_COLS}
        ${LEAD_FROM}
        WHERE l.status = 'survey' AND (l.survey_date != CAST(GETDATE() AS DATE) OR l.survey_date IS NULL)
        ORDER BY l.survey_date ASC
      `),
      // 7. Quotation รอเสนอ
      db.request().query(`
        SELECT ${LEAD_COLS}
        ${LEAD_FROM}
        WHERE l.status = 'quote'
        ORDER BY l.updated_at DESC
      `),
      // 8. รอติดตั้ง
      db.request().query(`
        SELECT ${LEAD_COLS}
        ${LEAD_FROM}
        WHERE l.status = 'order'
        ORDER BY l.updated_at DESC
      `),
      // 9. นัดติดตามที่ยังไม่ถึง (upcoming follow-up)
      db.request().query(`
        SELECT ${LEAD_COLS}
        ${LEAD_FROM}
        WHERE CAST(l.next_follow_up AS DATE) > CAST(GETDATE() AS DATE)
          AND l.status NOT IN ('install', 'lost')
        ORDER BY l.next_follow_up ASC
      `),
      // 10. รอนัดติดตั้ง — มัดจำแล้ว แต่ยังไม่นัดวันติดตั้ง (matches pipeline wait_install)
      db.request().query(`
        SELECT ${LEAD_COLS}
        ${LEAD_FROM}
        WHERE COALESCE(pay.paid_count, 0) > 0
          AND l.install_date IS NULL
          AND l.install_completed_at IS NULL
          AND l.status NOT IN ('lost', 'returned')
        ORDER BY l.updated_at DESC
      `),
      // 11. รอติดตั้ง — มีวันนัดติดตั้งแล้ว ยังไม่เสร็จ (matches pipeline install)
      db.request().query(`
        SELECT ${LEAD_COLS}
        ${LEAD_FROM}
        WHERE l.install_date IS NOT NULL
          AND l.install_completed_at IS NULL
          AND l.status NOT IN ('lost', 'returned')
        ORDER BY l.install_date ASC, l.updated_at DESC
      `),
      // 12. รอออกใบรับประกัน — status=warranty
      db.request().query(`
        SELECT ${LEAD_COLS}
        ${LEAD_FROM}
        WHERE l.status = 'warranty'
        ORDER BY l.install_completed_at DESC, l.updated_at DESC
      `),
      // 13. ปิดงานล่าสุด (7 วัน)
      db.request().query(`
        SELECT ${LEAD_COLS}
        ${LEAD_FROM}
        WHERE l.status = 'closed'
          AND l.install_completed_at >= DATEADD(day, -7, GETDATE())
        ORDER BY l.install_completed_at DESC
      `),
      // 14. Booking — pre_survey substeps -01 (รอยืนยันรับเงิน) + -02 (จอง).
      // Substep encoded directly in status column, so the filter is just an
      // IN-list — no payment_confirmed / slip_files predicates needed.
      db.request().query(`
        SELECT ${LEAD_COLS}
        ${LEAD_FROM}
        WHERE l.status IN ('pre_survey-01', 'pre_survey-02')
        ORDER BY l.status DESC, l.pre_booked_at DESC, l.updated_at DESC
      `),
      // Quick stats
      db.request().query(`
        SELECT
          (SELECT COUNT(*) FROM leads WHERE status NOT IN ('install', 'lost')) as pipeline,
          (SELECT COUNT(*) FROM leads WHERE status IN ('order', 'install')) as won,
          (SELECT COUNT(*) FROM leads WHERE status = 'lost') as lost,
          (SELECT COUNT(*) FROM leads WHERE created_at >= DATEADD(day, -7, GETDATE())) as new_this_week
      `),
    ]);

    return NextResponse.json({
      newLeads: fix(newLeads.recordset),
      overduePreSurvey: fix(overduePreSurvey.recordset),
      followUpToday: fix(followUpToday.recordset),
      followUpOverdue: fix(followUpOverdue.recordset),
      surveyToday: fix(surveyToday.recordset),
      surveyPending: fix(surveyPending.recordset),
      quotationPending: fix(quotationPending.recordset),
      installPending: fix(installPending.recordset),
      followUpUpcoming: fix(followUpUpcoming.recordset),
      waitInstall: fix(waitInstall.recordset),
      installScheduled: fix(installScheduled.recordset),
      warranty: fix(warranty.recordset),
      recentlyClosed: fix(recentlyClosed.recordset),
      booking: fix(booking.recordset),
      stats: stats.recordset[0],
    });
  } catch (error) {
    console.error("GET /api/today error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
