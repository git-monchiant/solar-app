import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    const r = await db.request().query(`
      SELECT
        (SELECT COUNT(*) FROM line_messages) as total_messages,
        (SELECT COUNT(DISTINCT line_user_id) FROM line_messages) as total_users,
        (SELECT COUNT(*) FROM line_messages WHERE received_at >= DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)) as month_messages,
        (SELECT COUNT(DISTINCT line_user_id) FROM line_messages WHERE received_at >= DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)) as month_users,
        (SELECT COUNT(*) FROM line_messages WHERE CAST(received_at AS DATE) = CAST(GETDATE() AS DATE)) as today_messages,
        (SELECT COUNT(DISTINCT line_user_id) FROM line_messages WHERE CAST(received_at AS DATE) = CAST(GETDATE() AS DATE)) as today_users
    `);
    return NextResponse.json(r.recordset[0]);
  } catch (error) {
    console.error("GET /api/line-stats error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
