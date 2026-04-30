import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// GET /api/calendar-blocks — list non-lead "other work" calendar blocks.
// POST /api/calendar-blocks — create one (admin / dispatch use).
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const db = await getDb();
  const r = await db.request().query(`
    SELECT b.id, b.title, b.block_date, b.time_slot, b.note, b.created_by, b.created_at,
           u.full_name AS created_by_name
    FROM calendar_blocks b
    LEFT JOIN users u ON u.id = b.created_by
    ORDER BY b.block_date
  `);
  return NextResponse.json(fixDates(r.recordset));
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const body = await req.json();
    if (!body.title || !body.block_date) {
      return NextResponse.json({ error: "title + block_date required" }, { status: 400 });
    }
    const db = await getDb();
    const r = await db.request()
      .input("title", sql.NVarChar(200), String(body.title))
      .input("block_date", sql.Date, body.block_date)
      .input("time_slot", sql.NVarChar(100), body.time_slot || null)
      .input("note", sql.NVarChar(sql.MAX), body.note || null)
      .input("created_by", sql.Int, gate.userId)
      .query(`
        INSERT INTO calendar_blocks (title, block_date, time_slot, note, created_by)
        OUTPUT INSERTED.*
        VALUES (@title, @block_date, @time_slot, @note, @created_by)
      `);
    return NextResponse.json(fixDates(r.recordset)[0], { status: 201 });
  } catch (e) {
    console.error("POST /api/calendar-blocks error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
