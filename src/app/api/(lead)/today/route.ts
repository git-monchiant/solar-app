import { NextRequest, NextResponse } from "next/server";
import { getDb, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// LeadCard + today page only read ~30 columns from the leads table. The full
// table is 60-80 cols per row (survey JSON blobs, photo URLs, etc.) so
// SELECT * was sending ~10× the bytes the UI actually used. This focused
// list also resolves project_name once via COALESCE so we don't need to
// flatten duplicate-aliased columns coming back from the mssql driver.
const LEAD_COLS = `
  l.id, l.full_name, l.house_number, l.phone, l.email, l.note,
  l.status, l.source, l.customer_type, l.line_id, l.zone,
  l.created_at, l.contact_date, l.updated_at, l.next_follow_up,
  l.assigned_user_id, l.installation_address, l.project_id,
  l.pre_doc_no, l.pre_total_price, l.payment_confirmed,
  l.survey_date, l.survey_time_slot,
  l.install_date, l.install_completed_at, l.install_extra_cost,
  l.order_total, l.quotation_amount,
  COALESCE(NULLIF(l.project_name, ''), p.name) as project_name,
  p.district, p.province, pk.name as package_name, u.full_name as assigned_name
`;

function fix<T extends Record<string, unknown>>(rs: T[]): T[] {
  return fixDates(rs) as T[];
}

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();

    const [newLeads, overduePreSurvey, followUpToday, followUpOverdue, surveyToday, surveyPending, quotationPending, installPending, followUpUpcoming, installing, recentlyClosed, booking, stats] = await Promise.all([
      // 1. Lead ใหม่ — pre_survey ที่ยังไม่มี doc และไม่มี follow-up ในอนาคต
      // เคยมี cutoff "อายุ < 2 วัน" แต่ทำให้ lead ที่ import จากชีต (ส่วนใหญ่ > 2 วัน) ตกจากกอง
      db.request().query(`
        SELECT ${LEAD_COLS},
               (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note,
               (SELECT TOP 1 created_at FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_date
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.status = 'pre_survey'
          AND l.pre_doc_no IS NULL
          AND (l.next_follow_up IS NULL OR CAST(l.next_follow_up AS DATE) < CAST(GETDATE() AS DATE))
        ORDER BY l.created_at DESC
      `),
      // 2. (deprecated — รวมกับ newLeads แล้ว)
      db.request().query(`SELECT TOP 0 * FROM leads`),
      // 3. นัดติดตามวันนี้
      db.request().query(`
        SELECT ${LEAD_COLS},
               (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note,
               (SELECT TOP 1 created_at FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_date
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.next_follow_up = CAST(GETDATE() AS DATE)
          AND l.status NOT IN ('install', 'lost')
        ORDER BY COALESCE(l.contact_date, l.created_at) ASC
      `),
      // 4. เลยกำหนดติดตาม (overdue follow-up)
      db.request().query(`
        SELECT ${LEAD_COLS},
               (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note,
               (SELECT TOP 1 created_at FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_date
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.next_follow_up < CAST(GETDATE() AS DATE)
          AND l.status NOT IN ('install', 'lost')
        ORDER BY COALESCE(l.contact_date, l.created_at) ASC
      `),
      // 5. Survey วันนี้
      db.request().query(`
        SELECT ${LEAD_COLS}
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.status = 'survey' AND l.survey_date = CAST(GETDATE() AS DATE)
        ORDER BY l.survey_time_slot ASC
      `),
      // 6. Survey รอดำเนินการ (ทั้งหมดที่ยังไม่เสร็จ ยกเว้นวันนี้)
      db.request().query(`
        SELECT ${LEAD_COLS}
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.status = 'survey' AND (l.survey_date != CAST(GETDATE() AS DATE) OR l.survey_date IS NULL)
        ORDER BY l.survey_date ASC
      `),
      // 7. Quotation รอเสนอ
      db.request().query(`
        SELECT ${LEAD_COLS},
               (SELECT TOP 1 created_at FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_date
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.status = 'quote'
        ORDER BY l.updated_at DESC
      `),
      // 8. รอติดตั้ง
      db.request().query(`
        SELECT ${LEAD_COLS},
               (SELECT TOP 1 created_at FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_date
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.status = 'order'
        ORDER BY l.updated_at DESC
      `),
      // 9. นัดติดตามที่ยังไม่ถึง (upcoming follow-up)
      db.request().query(`
        SELECT ${LEAD_COLS},
               (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note,
               (SELECT TOP 1 created_at FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_date
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE CAST(l.next_follow_up AS DATE) > CAST(GETDATE() AS DATE)
          AND l.status NOT IN ('install', 'lost')
        ORDER BY l.next_follow_up ASC
      `),
      // 10. กำลังติดตั้ง
      db.request().query(`
        SELECT ${LEAD_COLS}
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.status = 'install'
        ORDER BY l.install_date ASC, l.updated_at DESC
      `),
      // 11. ปิดงานล่าสุด (7 วัน)
      db.request().query(`
        SELECT ${LEAD_COLS}
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.status = 'closed'
          AND l.install_completed_at >= DATEADD(day, -7, GETDATE())
        ORDER BY l.install_completed_at DESC
      `),
      // 12. Booking — pre_survey substeps -01 (รอยืนยันรับเงิน) + -02 (จอง).
      // Substep encoded directly in status column, so the filter is just an
      // IN-list — no payment_confirmed / slip_files predicates needed.
      db.request().query(`
        SELECT ${LEAD_COLS},
               (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note,
               (SELECT TOP 1 created_at FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_date
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
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
      installing: fix(installing.recordset),
      recentlyClosed: fix(recentlyClosed.recordset),
      booking: fix(booking.recordset),
      stats: stats.recordset[0],
    });
  } catch (error) {
    console.error("GET /api/today error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
