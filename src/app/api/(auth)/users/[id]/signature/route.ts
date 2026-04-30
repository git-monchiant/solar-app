import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/users/:id/signature  -> streams the PNG bytes
// PUT /api/users/:id/signature  -> body: image bytes (Content-Type: image/png)
// DELETE /api/users/:id/signature -> clears the signature
//
// Stores binary in users.signature_data + users.signature_mime, and points
// users.signature_url at this same endpoint so existing <img src={url}> sites
// keep working without code changes.

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = parseInt(id);
  if (!userId) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  try {
    const db = await getDb();
    const r = await db.request().input("id", sql.Int, userId)
      .query(`SELECT signature_data, signature_mime FROM users WHERE id = @id`);
    const row = r.recordset[0];
    if (!row?.signature_data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(row.signature_data), {
      headers: {
        "Content-Type": row.signature_mime || "image/png",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    console.error("GET /api/users/[id]/signature error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const { id } = await params;
  const userId = parseInt(id);
  if (!userId) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  try {
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length === 0) return NextResponse.json({ error: "empty body" }, { status: 400 });
    const mime = req.headers.get("content-type") || "image/png";
    // Bust the public URL with a timestamp so any cached <img> reload — the
    // endpoint itself is stable but browsers/Puppeteer may cache the bytes.
    const url = `/api/users/${userId}/signature?v=${Date.now()}`;
    const db = await getDb();
    await db.request()
      .input("id", sql.Int, userId)
      .input("data", sql.VarBinary(sql.MAX), buf)
      .input("mime", sql.NVarChar(50), mime)
      .input("url", sql.NVarChar(200), url)
      .query(`UPDATE users SET signature_data = @data, signature_mime = @mime, signature_url = @url WHERE id = @id`);
    return NextResponse.json({ url });
  } catch (e) {
    console.error("PUT /api/users/[id]/signature error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const { id } = await params;
  const userId = parseInt(id);
  if (!userId) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  try {
    const db = await getDb();
    await db.request().input("id", sql.Int, userId)
      .query(`UPDATE users SET signature_data = NULL, signature_mime = NULL, signature_url = NULL WHERE id = @id`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/users/[id]/signature error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
