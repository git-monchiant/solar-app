import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Returns all upcoming/active survey appointments so the calendar
// can show occupied slots and prevent double-booking.
export async function GET() {
  try {
    const db = await getDb();
    const result = await db.request().query(`
      SELECT id, full_name, survey_date, survey_time_slot, status
      FROM leads
      WHERE survey_date IS NOT NULL
        AND status NOT IN ('installed', 'lost', 'registered')
    `);
    return NextResponse.json(result.recordset);
  } catch (error) {
    console.error("GET /api/surveys/scheduled error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
