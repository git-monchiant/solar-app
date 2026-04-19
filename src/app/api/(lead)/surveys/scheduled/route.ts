import { NextResponse } from "next/server";
import { getDb, fixDates } from "@/lib/db";

// Returns all upcoming/active survey appointments so the calendar
// can show occupied slots and prevent double-booking.
export async function GET() {
  try {
    const db = await getDb();
    const result = await db.request().query(`
      SELECT id, full_name, survey_date as event_date, survey_time_slot as time_slot, 'survey' as event_type, status, zone
      FROM leads
      WHERE survey_date IS NOT NULL
        AND status = 'survey'
      UNION ALL
      SELECT id, full_name, install_date as event_date, NULL as time_slot, 'install' as event_type, status, zone
      FROM leads
      WHERE install_date IS NOT NULL
        AND status = 'install'
    `);
    return NextResponse.json(fixDates(result.recordset));
  } catch (error) {
    console.error("GET /api/surveys/scheduled error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
