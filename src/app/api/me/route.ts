import { NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

const CURRENT_USER_ID = 1;

export async function GET() {
  try {
    const db = await getDb();
    const user = await db.request().input("id", sql.Int, CURRENT_USER_ID).query(`
      SELECT id, username, full_name, team, role, phone, email FROM users WHERE id = @id
    `);
    if (user.recordset.length === 0) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const stats = await db.request()
      .input("user_id", sql.Int, CURRENT_USER_ID)
      .input("first_day", sql.DateTime2, firstDay)
      .query(`
        SELECT
          (SELECT COUNT(*) FROM leads WHERE created_at >= @first_day) as new_leads,
          (SELECT COUNT(*) FROM bookings WHERE created_at >= @first_day) as booked,
          (SELECT COUNT(*) FROM leads WHERE status = 'purchased' AND updated_at >= @first_day) as won
      `);

    return NextResponse.json({ ...user.recordset[0], stats: stats.recordset[0] });
  } catch (error) {
    console.error("GET /api/me error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
