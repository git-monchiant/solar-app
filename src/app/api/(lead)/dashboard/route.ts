import { NextRequest, NextResponse } from "next/server";
import { getDb, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      totals,
      thisMonth,
      lastMonth,
      statusBreakdown,
      recentLeads,
      topProjects,
      recentActivities,
      activityHeatmap,
    ] = await Promise.all([
      db.request().query(`
        SELECT
          (SELECT COUNT(*) FROM leads) as total_leads,
          (SELECT COUNT(*) FROM leads WHERE pre_doc_no IS NOT NULL) as total_deposits,
          (SELECT ISNULL(SUM(pre_total_price), 0) FROM leads WHERE pre_doc_no IS NOT NULL) as total_deposit_value,
          (SELECT COUNT(*) FROM leads WHERE status = 'order') as total_won
      `),
      // Revenue is recognized the moment an install is completed (status moves to
      // warranty → gridtie → closed after that). Filtering on status='closed' would
      // under-count real business done in the month. Use install_completed_at as
      // the single source of truth for "installed this month".
      db.request().input("first_day", firstDay).query(`
        SELECT
          (SELECT COUNT(*) FROM leads WHERE created_at >= @first_day) as new_leads,
          (SELECT COUNT(*) FROM leads WHERE install_completed_at >= @first_day) as closed_count,
          (SELECT ISNULL(SUM(ISNULL(order_total,0) + ISNULL(install_extra_cost,0)), 0) FROM leads WHERE install_completed_at >= @first_day) as closed_value
      `),
      db.request().input("lm_start", lastMonthFirst).input("lm_end", lastMonthEnd).query(`
        SELECT
          (SELECT COUNT(*) FROM leads WHERE created_at >= @lm_start AND created_at <= @lm_end) as new_leads,
          (SELECT COUNT(*) FROM leads WHERE install_completed_at >= @lm_start AND install_completed_at <= @lm_end) as closed_count
      `),
      db.request().query(`SELECT status, COUNT(*) as count FROM leads GROUP BY status`),
      db.request().query(`
        SELECT TOP 8 l.id, l.full_name, l.status, l.created_at, p.name as project_name
        FROM leads l LEFT JOIN projects p ON l.project_id = p.id
        ORDER BY l.created_at DESC
      `),
      db.request().query(`
        SELECT TOP 5 p.name, COUNT(*) as lead_count, SUM(CASE WHEN l.status = 'order' THEN 1 ELSE 0 END) as won
        FROM leads l JOIN projects p ON l.project_id = p.id
        GROUP BY p.name ORDER BY lead_count DESC
      `),
      db.request().query(`
        SELECT TOP 5 la.title, la.activity_type, la.created_at, l.full_name, u.full_name as by_name
        FROM lead_activities la
        JOIN leads l ON la.lead_id = l.id
        LEFT JOIN users u ON la.created_by = u.id
        ORDER BY la.created_at DESC
      `),
      // Rolling 33-day window: last 30 days of activity + 3-day future buffer to
      // match seeker dashboard. Future bars stay empty on the client.
      db.request().query(`
        SELECT CAST(la.created_at AS DATE) as day, la.lead_id, l.full_name, la.activity_type,
               COALESCE(
                 (SELECT TOP 1 new_status FROM lead_activities
                  WHERE lead_id = la.lead_id AND activity_type = 'status_change'
                    AND created_at <= DATEADD(day, 1, CAST(la.created_at AS DATE))
                  ORDER BY created_at DESC),
                 'pre_survey'
               ) as lead_status,
               (SELECT COUNT(*) FROM lead_activities WHERE lead_id = la.lead_id AND created_at <= DATEADD(day, 1, CAST(la.created_at AS DATE))) as total_activities,
               CASE WHEN EXISTS (
                 SELECT 1 FROM lead_activities
                 WHERE lead_id = la.lead_id AND activity_type = 'payment_confirmed'
                   AND CAST(created_at AS DATE) = CAST(la.created_at AS DATE)
               ) THEN 1 ELSE 0 END as has_paid
        FROM lead_activities la
        JOIN leads l ON la.lead_id = l.id
        WHERE la.created_at >= DATEADD(day, -33, CAST(GETDATE() AS DATE))
        ORDER BY day, la.created_at ASC
      `),
    ]);

    const t = totals.recordset[0];
    const tm = thisMonth.recordset[0];
    const lm = lastMonth.recordset[0];

    return NextResponse.json({
      total_leads: t.total_leads,
      total_deposits: t.total_deposits,
      total_deposit_value: t.total_deposit_value,
      total_won: t.total_won,
      conversion_rate: t.total_leads > 0 ? Math.round((t.total_won / t.total_leads) * 100) : 0,
      this_month: tm,
      last_month: lm,
      status_breakdown: statusBreakdown.recordset,
      recent_leads: fixDates(recentLeads.recordset),
      top_projects: topProjects.recordset,
      recent_activities: fixDates(recentActivities.recordset),
      activity_heatmap: fixDates(activityHeatmap.recordset),
    });
  } catch (error) {
    console.error("GET /api/dashboard error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard" }, { status: 500 });
  }
}
