import { NextResponse } from "next/server";
import { getDb, fixDates } from "@/lib/db";

export async function GET() {
  try {
    const db = await getDb();

    const [newLeads, overduePreSurvey, followUpToday, followUpOverdue, surveyToday, surveyPending, quotationPending, installPending, followUpUpcoming, installing, recentlyClosed, stats] = await Promise.all([
      // 1. Lead ใหม่รอจอง (pre_survey + no pre_doc_no + < 2 days)
      db.request().query(`
        SELECT l.*, p.name as project_name, p.district, p.province, pk.name as package_name, u.full_name as assigned_name,
               (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.status = 'pre_survey'
          AND l.pre_doc_no IS NULL
          AND l.created_at >= DATEADD(day, -2, GETDATE())
          AND (l.next_follow_up IS NULL OR CAST(l.next_follow_up AS DATE) < CAST(GETDATE() AS DATE))
        ORDER BY COALESCE(l.contact_date, l.created_at) ASC
      `),
      // 2. เกินกำหนดจอง (pre_survey + no pre_doc_no + > 2 days)
      db.request().query(`
        SELECT l.*, p.name as project_name, p.district, p.province, pk.name as package_name, u.full_name as assigned_name,
               (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.status = 'pre_survey'
          AND l.pre_doc_no IS NULL
          AND l.created_at < DATEADD(day, -2, GETDATE())
          AND (l.next_follow_up IS NULL OR CAST(l.next_follow_up AS DATE) < CAST(GETDATE() AS DATE))
        ORDER BY COALESCE(l.contact_date, l.created_at) ASC
      `),
      // 3. นัดติดตามวันนี้
      db.request().query(`
        SELECT l.*, p.name as project_name, p.district, p.province, pk.name as package_name, u.full_name as assigned_name,
               (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note
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
        SELECT l.*, p.name as project_name, p.district, p.province, pk.name as package_name, u.full_name as assigned_name,
               (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note
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
        SELECT l.*, p.name as project_name, p.district, p.province, pk.name as package_name, u.full_name as assigned_name
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.status = 'survey' AND l.survey_date = CAST(GETDATE() AS DATE)
        ORDER BY l.survey_time_slot ASC
      `),
      // 6. Survey รอดำเนินการ (ทั้งหมดที่ยังไม่เสร็จ ยกเว้นวันนี้)
      db.request().query(`
        SELECT l.*, p.name as project_name, p.district, p.province, pk.name as package_name, u.full_name as assigned_name
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.status = 'survey' AND (l.survey_date != CAST(GETDATE() AS DATE) OR l.survey_date IS NULL)
        ORDER BY l.survey_date ASC
      `),
      // 7. Quotation รอเสนอ
      db.request().query(`
        SELECT l.*, p.name as project_name, p.district, p.province, pk.name as package_name, u.full_name as assigned_name
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.status = 'quote'
        ORDER BY l.updated_at DESC
      `),
      // 8. รอติดตั้ง
      db.request().query(`
        SELECT l.*, p.name as project_name, p.district, p.province, pk.name as package_name, u.full_name as assigned_name
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.status = 'order'
        ORDER BY l.updated_at DESC
      `),
      // 9. นัดติดตามที่ยังไม่ถึง (upcoming follow-up)
      db.request().query(`
        SELECT l.*, p.name as project_name, p.district, p.province, pk.name as package_name, u.full_name as assigned_name,
               (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note
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
        SELECT l.*, p.name as project_name, p.district, p.province, pk.name as package_name, u.full_name as assigned_name
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.status = 'install'
        ORDER BY l.install_date ASC, l.updated_at DESC
      `),
      // 11. ปิดงานล่าสุด (7 วัน)
      db.request().query(`
        SELECT l.*, p.name as project_name, p.district, p.province, pk.name as package_name, u.full_name as assigned_name
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        LEFT JOIN users u ON l.assigned_user_id = u.id
        WHERE l.status = 'closed'
          AND l.install_completed_at >= DATEADD(day, -7, GETDATE())
        ORDER BY l.install_completed_at DESC
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
      newLeads: fixDates(newLeads.recordset),
      overduePreSurvey: fixDates(overduePreSurvey.recordset),
      followUpToday: fixDates(followUpToday.recordset),
      followUpOverdue: fixDates(followUpOverdue.recordset),
      surveyToday: fixDates(surveyToday.recordset),
      surveyPending: fixDates(surveyPending.recordset),
      quotationPending: fixDates(quotationPending.recordset),
      installPending: fixDates(installPending.recordset),
      followUpUpcoming: fixDates(followUpUpcoming.recordset),
      installing: fixDates(installing.recordset),
      recentlyClosed: fixDates(recentlyClosed.recordset),
      stats: stats.recordset[0],
    });
  } catch (error) {
    console.error("GET /api/today error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
