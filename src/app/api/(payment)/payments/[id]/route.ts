import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/payments/<id>  → serve slip BLOB (fallback when /api/slips/<id> is gone)
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payId = parseInt(id);
  if (!payId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const db = await getDb();
    const r = await db.request().input("id", sql.Int, payId)
      .query(`SELECT slip_data, slip_mime FROM payments WHERE id = @id`);
    if (r.recordset.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = r.recordset[0];
    return new NextResponse(row.slip_data, {
      headers: {
        "Content-Type": row.slip_mime || "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("GET /api/payments/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// DELETE /api/payments/<id>  → remove one row (rarely used; prefer DELETE by step_no)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payId = parseInt(id);
  if (!payId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const db = await getDb();
    await db.request().input("id", sql.Int, payId).query(`DELETE FROM payments WHERE id = @id`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/payments/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
