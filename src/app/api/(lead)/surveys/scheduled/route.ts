import { NextRequest, NextResponse } from "next/server";
import { getDb, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// Returns all upcoming/active survey appointments so the calendar
// can show occupied slots and prevent double-scheduling.
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    // Block slots for any lead that has a survey_date/install_date set — even
    // if the lead has advanced past that stage (the surveyor/installer already
    // has that appointment on the calendar). Exclude terminal cancels so freed
    // slots come back to the pool.
    const result = await db.request().query(`
      SELECT id, full_name, survey_date as event_date, survey_time_slot as time_slot, 'survey' as event_type, status, zone
      FROM leads
      WHERE survey_date IS NOT NULL
        AND status NOT IN ('lost', 'returned')
      UNION ALL
      SELECT id, full_name, install_date as event_date, NULL as time_slot, 'install' as event_type, status, zone
      FROM leads
      WHERE install_date IS NOT NULL
        AND status NOT IN ('lost', 'returned')
    `);
    return NextResponse.json(fixDates(result.recordset));
  } catch (error) {
    console.error("GET /api/surveys/scheduled error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
