import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = await getDb();

    const [overdue, today, untouched, stats] = await Promise.all([
      // Overdue follow-ups
      db.request().query(`
        SELECT l.*, p.name as project_name, pk.name as package_name,
               (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        WHERE l.next_follow_up < CAST(GETDATE() AS DATE)
          AND l.status NOT IN ('installed', 'lost')
        ORDER BY l.next_follow_up ASC
      `),
      // Today's follow-ups + revisits
      db.request().query(`
        SELECT l.*, p.name as project_name, pk.name as package_name,
               (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        WHERE (l.next_follow_up = CAST(GETDATE() AS DATE)
               OR (l.status = 'lost' AND l.revisit_date = CAST(GETDATE() AS DATE)))
        ORDER BY l.created_at DESC
      `),
      // New leads with no activities (except "Lead created")
      db.request().query(`
        SELECT l.*, p.name as project_name, pk.name as package_name
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        WHERE l.status = 'registered'
          AND (SELECT COUNT(*) FROM lead_activities WHERE lead_id = l.id AND activity_type != 'note') = 0
        ORDER BY l.created_at DESC
      `),
      // Quick stats
      db.request().query(`
        SELECT
          (SELECT COUNT(*) FROM leads WHERE status NOT IN ('installed', 'lost')) as pipeline,
          (SELECT COUNT(*) FROM leads WHERE status IN ('purchased', 'installed')) as won,
          (SELECT COUNT(*) FROM leads WHERE status = 'lost') as lost,
          (SELECT COUNT(*) FROM leads WHERE created_at >= DATEADD(day, -7, GETDATE())) as new_this_week
      `),
    ]);

    return NextResponse.json({
      overdue: overdue.recordset,
      today: today.recordset,
      untouched: untouched.recordset,
      stats: stats.recordset[0],
    });
  } catch (error) {
    console.error("GET /api/today error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
