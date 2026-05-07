import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// GET /api/prospects/<id>/activities
// Returns the audit trail for a prospect joined with the user who performed
// each action. Newest first. Used by the "Log" tab in the seeker modal.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const pid = parseInt(id);
    if (!pid) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const db = await getDb();
    const r = await db.request().input("pid", sql.Int, pid).query(`
      SELECT pa.id, pa.activity_type, pa.title, pa.note, pa.old_value, pa.new_value,
             pa.created_by, pa.created_at,
             u.full_name AS created_by_name
      FROM prospect_activities pa
      LEFT JOIN users u ON pa.created_by = u.id
      WHERE pa.prospect_id = @pid
      ORDER BY pa.created_at DESC, pa.id DESC
    `);
    return NextResponse.json(fixDates(r.recordset));
  } catch (e) {
    console.error("GET /api/prospects/[id]/activities error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
