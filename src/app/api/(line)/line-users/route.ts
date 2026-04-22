import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// LINE profile registry. Same LINE can be attached to many leads/prospects,
// and that link lives on leads.line_id / prospects.line_id — not here.
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    const result = await db.request().query(`
      SELECT lu.id, lu.line_user_id, lu.display_name, lu.picture_url, lu.created_at, lu.last_message_at,
        (SELECT COUNT(*) FROM leads WHERE line_id = lu.line_user_id) as linked_leads_count,
        (SELECT COUNT(*) FROM prospects WHERE line_id = lu.line_user_id) as linked_prospects_count
      FROM line_users lu
      ORDER BY lu.created_at DESC
    `);
    return NextResponse.json(result.recordset);
  } catch (error) {
    console.error("GET /api/line-users error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
