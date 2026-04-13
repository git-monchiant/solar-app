import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = await getDb();

    const [newLeads, overdueBooking, followUpToday, followUpOverdue, stats] = await Promise.all([
      // 1. Lead ใหม่รอจอง (registered + no booking + < 2 days)
      db.request().query(`
        SELECT l.*, p.name as project_name, pk.name as package_name,
               (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        WHERE l.status = 'registered'
          AND NOT EXISTS (SELECT 1 FROM bookings WHERE lead_id = l.id)
          AND l.created_at >= DATEADD(day, -2, GETDATE())
        ORDER BY l.created_at DESC
      `),
      // 2. เกินกำหนดจอง (registered + no booking + > 2 days)
      db.request().query(`
        SELECT l.*, p.name as project_name, pk.name as package_name,
               (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        WHERE l.status = 'registered'
          AND NOT EXISTS (SELECT 1 FROM bookings WHERE lead_id = l.id)
          AND l.created_at < DATEADD(day, -2, GETDATE())
        ORDER BY l.created_at ASC
      `),
      // 3. นัดติดตามวันนี้
      db.request().query(`
        SELECT l.*, p.name as project_name, pk.name as package_name,
               (SELECT TOP 1 note FROM lead_activities WHERE lead_id = l.id ORDER BY created_at DESC) as last_activity_note
        FROM leads l
        LEFT JOIN projects p ON l.project_id = p.id
        LEFT JOIN packages pk ON l.interested_package_id = pk.id
        WHERE l.next_follow_up = CAST(GETDATE() AS DATE)
          AND l.status NOT IN ('installed', 'lost')
        ORDER BY l.created_at DESC
      `),
      // 4. เลยกำหนดติดตาม (overdue follow-up)
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
      newLeads: newLeads.recordset,
      overdueBooking: overdueBooking.recordset,
      followUpToday: followUpToday.recordset,
      followUpOverdue: followUpOverdue.recordset,
      stats: stats.recordset[0],
    });
  } catch (error) {
    console.error("GET /api/today error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
