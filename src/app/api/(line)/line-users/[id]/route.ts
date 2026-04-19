import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const db = await getDb();

    if (body.lead_id !== undefined) {
      await db.request()
        .input("id", sql.Int, parseInt(id))
        .input("lead_id", sql.Int, body.lead_id)
        .query(`UPDATE line_users SET lead_id = @lead_id WHERE id = @id`);

      // Also set line_id on lead
      if (body.lead_id) {
        const lu = await db.request().input("id", sql.Int, parseInt(id)).query(`SELECT line_user_id FROM line_users WHERE id = @id`);
        if (lu.recordset.length > 0) {
          await db.request()
            .input("lead_id", sql.Int, body.lead_id)
            .input("line_id", sql.NVarChar(100), lu.recordset[0].line_user_id)
            .query(`UPDATE leads SET line_id = @line_id WHERE id = @lead_id`);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/line-users error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
