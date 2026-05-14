import { NextRequest, NextResponse } from "next/server";
import { getDb, fixDates, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// Admin-only read endpoint — paginated list of recent client errors.
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "100"), 500);
    const db = await getDb();
    const r = await db.request()
      .input("limit", sql.Int, limit)
      .query(`
        SELECT TOP (@limit)
          e.id, e.created_at, e.source, e.message, e.stack, e.url, e.user_agent,
          e.status_code, e.request_url, e.user_id, u.full_name AS user_name
        FROM client_errors e
        LEFT JOIN users u ON u.id = e.user_id
        ORDER BY e.id DESC
      `);
    return NextResponse.json(fixDates(r.recordset));
  } catch (e) {
    console.error("GET /api/client-errors error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
