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
      ;WITH block_days AS (
        -- Expand each calendar_block into one row per day in [block_date, end_date].
        -- end_date NULL = single-day block. The recursive CTE walks day-by-day
        -- so multi-day "ลาพักร้อน" blocks show up on every covered day.
        SELECT id, title, time_slot, block_date AS d, COALESCE(end_date, block_date) AS last_d
        FROM calendar_blocks
        UNION ALL
        SELECT id, title, time_slot, DATEADD(day, 1, d), last_d
        FROM block_days
        WHERE d < last_d
      )
      SELECT id, full_name, house_number, survey_date as event_date, survey_time_slot as time_slot, 'survey' as event_type, status, zone
      FROM leads
      WHERE survey_date IS NOT NULL
        AND status NOT IN ('lost', 'returned')
      UNION ALL
      SELECT id, full_name, house_number, install_date as event_date, NULL as time_slot, 'install' as event_type, status, zone
      FROM leads
      WHERE install_date IS NOT NULL
        AND status NOT IN ('lost', 'returned')
      UNION ALL
      SELECT (-id) as id, title as full_name, NULL as house_number,
             d as event_date, time_slot, 'block' as event_type,
             'block' as status, NULL as zone
      FROM block_days
      OPTION (MAXRECURSION 366)
    `);
    return NextResponse.json(fixDates(result.recordset));
  } catch (error) {
    console.error("GET /api/surveys/scheduled error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
