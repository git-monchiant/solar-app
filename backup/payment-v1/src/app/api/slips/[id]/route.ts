import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/slips/<id>  → serve slip binary from DB
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const slipId = parseInt(id);
  if (!slipId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const db = await getDb();
    const r = await db.request().input("id", sql.Int, slipId)
      .query(`SELECT data, mime FROM slip_files WHERE id = @id`);
    if (r.recordset.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = r.recordset[0];
    return new NextResponse(row.data, {
      headers: {
        "Content-Type": row.mime || "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("GET /api/slips/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// DELETE /api/slips/<id>  → remove slip record (called when user clicks ✕)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const slipId = parseInt(id);
  if (!slipId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const db = await getDb();
    await db.request().input("id", sql.Int, slipId).query(`DELETE FROM slip_files WHERE id = @id`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/slips/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
