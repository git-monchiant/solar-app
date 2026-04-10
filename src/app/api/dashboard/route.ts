import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = await getDb();

    const [leads, bookings, statusBreakdown, recentLeads] = await Promise.all([
      db.request().query(`SELECT COUNT(*) as total FROM leads`),
      db.request().query(`
        SELECT COUNT(*) as total, ISNULL(SUM(total_price), 0) as total_value FROM bookings
      `),
      db.request().query(`
        SELECT status, COUNT(*) as count FROM leads GROUP BY status
      `),
      db.request().query(`
        SELECT TOP 5 l.*, p.name as project_name
        FROM leads l LEFT JOIN projects p ON l.project_id = p.id
        ORDER BY l.created_at DESC
      `),
    ]);

    return NextResponse.json({
      total_leads: leads.recordset[0].total,
      total_bookings: bookings.recordset[0].total,
      total_booking_value: bookings.recordset[0].total_value,
      status_breakdown: statusBreakdown.recordset,
      recent_leads: recentLeads.recordset,
    });
  } catch (error) {
    console.error("GET /api/dashboard error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard" }, { status: 500 });
  }
}
