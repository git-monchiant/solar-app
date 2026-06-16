import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates, toSqlDate } from "@/lib/db";
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

    // Optional `from` / `to` (YYYY-MM-DD) — scope totals + total_received to
    // the cohort of leads created in that window so the dashboard's global
    // date filter cascades to server-aggregated numbers. Empty → no filter.
    const fromYmd = req.nextUrl.searchParams.get("from") || "";
    const toYmd   = req.nextUrl.searchParams.get("to")   || "";
    const fromDate = toSqlDate(fromYmd);
    const toDate   = toSqlDate(toYmd);
    const leadDateWhere = (alias = "l") => {
      const c: string[] = [];
      if (fromDate) c.push(`CAST(${alias}.created_at AS DATE) >= @from`);
      if (toDate)   c.push(`CAST(${alias}.created_at AS DATE) <= @to`);
      return c.length ? (`AND ` + c.join(" AND ")) : "";
    };
    const bindRange = (r: ReturnType<typeof db.request>) => {
      if (fromDate) r.input("from", sql.Date, fromDate);
      if (toDate)   r.input("to",   sql.Date, toDate);
      return r;
    };

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
      bindRange(db.request()).query(`
        SELECT
          (SELECT COUNT(*) FROM leads l WHERE 1=1 ${leadDateWhere()}) as total_leads,
          (SELECT COUNT(*) FROM leads l WHERE pre_doc_no IS NOT NULL ${leadDateWhere()}) as total_deposits,
          (SELECT ISNULL(SUM(pre_total_price), 0) FROM leads l WHERE pre_doc_no IS NOT NULL ${leadDateWhere()}) as total_deposit_value,
          (SELECT COUNT(*) FROM leads l WHERE status = 'order' ${leadDateWhere()}) as total_won,
          -- All cash received that accounting has confirmed (level-2 sign-off).
          -- Covers every slip_field — booking deposit, order installments, etc.
          -- When from/to is set, only payments belonging to leads created in
          -- that window count toward the total.
          (SELECT ISNULL(SUM(p.amount), 0) FROM payments p
            INNER JOIN leads l ON l.id = p.lead_id
            WHERE p.confirmed_at IS NOT NULL ${leadDateWhere()}) as total_received
      `),
      // Revenue is recognized the moment an install is completed (status moves to
      // warranty → gridtie → closed after that). Filtering on status='closed' would
      // under-count real business done in the month. Use install_completed_at as
      // the single source of truth for "installed this month".
      db.request().input("first_day", firstDay).query(`
        SELECT
          (SELECT COUNT(*) FROM leads WHERE created_at >= @first_day) as new_leads,
          (SELECT COUNT(*) FROM leads WHERE install_completed_at >= @first_day) as closed_count,
          (SELECT ISNULL(SUM(ISNULL(order_total,0) + ISNULL(install_extra_cost,0)), 0) FROM leads WHERE install_completed_at >= @first_day) as closed_value,
          (SELECT ISNULL(SUM(ISNULL(l.order_total,0) + ISNULL(l.install_extra_cost,0) - ISNULL(cp.paid,0)), 0)
             FROM leads l
             LEFT JOIN (
               -- Sum every confirmed payment, not just order_installment_*. The
               -- ฿1,000 booking deposit lives under slip_field='pre_slip_url' and
               -- is part of the customer's total obligation (order_total
               -- includes it), so filtering it out made fully-paid leads look
               -- ฿1K outstanding on the dashboard.
               SELECT lead_id, SUM(amount) AS paid
               FROM payments
               WHERE confirmed_at IS NOT NULL
               GROUP BY lead_id
             ) cp ON cp.lead_id = l.id
             WHERE l.install_completed_at >= @first_day) as closed_outstanding
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
        SELECT COALESCE(la.followup_date, CAST(la.created_at AS DATE)) as day, la.lead_id, l.full_name, la.activity_type,
               COALESCE(
                 (SELECT TOP 1
                    CASE WHEN activity_type = 'status_change' THEN new_status ELSE NULL END
                  FROM lead_activities
                  WHERE lead_id = la.lead_id
                    AND CAST(created_at AS DATE) = CAST(la.created_at AS DATE)
                  ORDER BY created_at DESC),
                 'pre_survey'
               ) as lead_status,
               (SELECT COUNT(*) FROM lead_activities
                WHERE lead_id = la.lead_id
                  AND activity_type IN ('call','visit','line','other','follow_up','loan_followup')
                  AND created_at <= DATEADD(day, 1, CAST(la.created_at AS DATE))) as total_activities,
               CASE WHEN EXISTS (
                 SELECT 1 FROM lead_activities
                 WHERE lead_id = la.lead_id AND activity_type = 'payment_confirmed'
                   AND CAST(created_at AS DATE) = COALESCE(la.followup_date, CAST(la.created_at AS DATE))
               ) THEN 1 ELSE 0 END as has_paid
        FROM lead_activities la
        JOIN leads l ON la.lead_id = l.id
        WHERE la.activity_type IN ('lead_created','call','visit','line','other','follow_up','loan_followup')
          AND (la.created_at >= DATEADD(day, -33, CAST(GETDATE() AS DATE))
            OR la.followup_date >= DATEADD(day, -33, CAST(GETDATE() AS DATE)))
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
      total_received: t.total_received,
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
