import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { getUserIdFromReq } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const db = await getDb();
    const user = await db.request().input("id", sql.Int, userId).query(`
      SELECT id, username, full_name, team, role, phone, email FROM users WHERE id = @id AND is_active = 1
    `);
    if (user.recordset.length === 0) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const rolesRes = await db.request().input("id", sql.Int, userId).query(`
      SELECT role FROM user_roles WHERE user_id = @id ORDER BY role
    `);
    const roles = rolesRes.recordset.map(r => r.role);

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const stats = await db.request()
      .input("user_id", sql.Int, userId)
      .input("first_day", sql.DateTime2, firstDay)
      .query(`
        SELECT
          (SELECT COUNT(*) FROM leads WHERE created_at >= @first_day) as new_leads,
          (SELECT COUNT(*) FROM leads WHERE pre_booked_at >= @first_day) as booked,
          (SELECT COUNT(*) FROM leads WHERE status = 'order' AND updated_at >= @first_day) as won
      `);

    return NextResponse.json({ ...user.recordset[0], roles, stats: stats.recordset[0] });
  } catch (error) {
    console.error("GET /api/me error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
