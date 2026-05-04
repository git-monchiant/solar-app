import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/slips/<id>  → serve binary
// NOTE: <img src=...> can't send custom headers, so this remains public. If we
// later switch to cookie/session auth the middleware can gate it uniformly.
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

// PATCH /api/slips/<id>  body: { submit: true }
// Marks the staging slip as "submitted for accountant review" (sets
// submitted_at). Until submitted, the slip is a draft and won't appear
// in the accountant's pending-approval queue.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const { id } = await params;
  const slipId = parseInt(id);
  if (!slipId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.submit === true) {
      const db = await getDb();
      await db.request().input("id", sql.Int, slipId)
        .query(`UPDATE slip_files SET submitted_at = GETDATE() WHERE id = @id AND submitted_at IS NULL`);
      return NextResponse.json({ ok: true });
    }
    if (body.submit === false) {
      // Revert to draft so the uploader can edit/replace before resubmitting.
      const db = await getDb();
      await db.request().input("id", sql.Int, slipId)
        .query(`UPDATE slip_files SET submitted_at = NULL WHERE id = @id`);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "No-op" }, { status: 400 });
  } catch (e) {
    console.error("PATCH /api/slips/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// DELETE /api/slips/<id>  → remove record
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
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
