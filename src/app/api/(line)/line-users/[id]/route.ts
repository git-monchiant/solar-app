import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// PATCH sets leads.line_id / prospects.line_id from this LINE user's profile.
// The same LINE can be attached to many leads/prospects simultaneously — no
// reverse column on line_users, it's a pure profile registry.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(request);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const body = await request.json();
    const db = await getDb();

    const lu = await db.request().input("id", sql.Int, parseInt(id)).query(
      `SELECT line_user_id FROM line_users WHERE id = @id`
    );
    if (lu.recordset.length === 0) {
      return NextResponse.json({ error: "LINE user not found" }, { status: 404 });
    }
    const lineUserId: string = lu.recordset[0].line_user_id;

    if (body.lead_id !== undefined && body.lead_id !== null) {
      await db.request()
        .input("lead_id", sql.Int, body.lead_id)
        .input("line_id", sql.NVarChar(100), lineUserId)
        .query(`UPDATE leads SET line_id = @line_id WHERE id = @lead_id`);
    }

    if (body.prospect_id !== undefined && body.prospect_id !== null) {
      await db.request()
        .input("prospect_id", sql.Int, body.prospect_id)
        .input("line_id", sql.NVarChar(100), lineUserId)
        .query(`UPDATE prospects SET line_id = @line_id WHERE id = @prospect_id`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/line-users error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
