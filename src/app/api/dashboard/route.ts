import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
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
    ] = await Promise.all([
      db.request().query(`
        SELECT
          (SELECT COUNT(*) FROM leads) as total_leads,
          (SELECT COUNT(*) FROM bookings) as total_bookings,
          (SELECT ISNULL(SUM(total_price), 0) FROM bookings) as total_booking_value,
          (SELECT COUNT(*) FROM leads WHERE status = 'purchased') as total_won
      `),
      db.request().input("first_day", firstDay).query(`
        SELECT
          (SELECT COUNT(*) FROM leads WHERE created_at >= @first_day) as new_leads,
          (SELECT COUNT(*) FROM bookings WHERE created_at >= @first_day) as bookings,
          (SELECT ISNULL(SUM(total_price), 0) FROM bookings WHERE created_at >= @first_day) as booking_value,
          (SELECT COUNT(*) FROM leads WHERE status = 'purchased' AND updated_at >= @first_day) as won
      `),
      db.request().input("lm_start", lastMonthFirst).input("lm_end", lastMonthEnd).query(`
        SELECT
          (SELECT COUNT(*) FROM leads WHERE created_at >= @lm_start AND created_at <= @lm_end) as new_leads,
          (SELECT COUNT(*) FROM bookings WHERE created_at >= @lm_start AND created_at <= @lm_end) as bookings
      `),
      db.request().query(`SELECT status, COUNT(*) as count FROM leads GROUP BY status`),
      db.request().query(`
        SELECT TOP 8 l.id, l.full_name, l.status, l.created_at, p.name as project_name
        FROM leads l LEFT JOIN projects p ON l.project_id = p.id
        ORDER BY l.created_at DESC
      `),
      db.request().query(`
        SELECT TOP 5 p.name, COUNT(*) as lead_count, SUM(CASE WHEN l.status = 'purchased' THEN 1 ELSE 0 END) as won
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
    ]);

    const t = totals.recordset[0];
    const tm = thisMonth.recordset[0];
    const lm = lastMonth.recordset[0];

    return NextResponse.json({
      total_leads: t.total_leads,
      total_bookings: t.total_bookings,
      total_booking_value: t.total_booking_value,
      total_won: t.total_won,
      conversion_rate: t.total_leads > 0 ? Math.round((t.total_won / t.total_leads) * 100) : 0,
      this_month: tm,
      last_month: lm,
      status_breakdown: statusBreakdown.recordset,
      recent_leads: recentLeads.recordset,
      top_projects: topProjects.recordset,
      recent_activities: recentActivities.recordset,
    });
  } catch (error) {
    console.error("GET /api/dashboard error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard" }, { status: 500 });
  }
}
