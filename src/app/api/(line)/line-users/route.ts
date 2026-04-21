import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    const result = await db.request().query(`
      SELECT lu.*, l.full_name as lead_name, l.phone as lead_phone
      FROM line_users lu
      LEFT JOIN leads l ON lu.lead_id = l.id
      ORDER BY lu.last_message_at DESC
    `);
    return NextResponse.json(result.recordset);
  } catch (error) {
    console.error("GET /api/line-users error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
