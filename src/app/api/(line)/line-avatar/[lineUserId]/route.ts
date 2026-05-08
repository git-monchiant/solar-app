import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/line-avatar/<line_user_id>  → serve avatar bytes from line_users.
// NOTE: <img src=...> can't send custom headers, so this stays public — the
// underlying line_user_id is opaque and not enumerable, same threat profile
// as the LINE CDN URL it replaces.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ lineUserId: string }> }) {
  const { lineUserId } = await params;
  if (!lineUserId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const db = await getDb();
    const r = await db.request()
      .input("id", sql.NVarChar(100), lineUserId)
      .query(`SELECT TOP 1 picture_blob, picture_mime FROM line_users WHERE line_user_id = @id`);
    if (r.recordset.length === 0 || !r.recordset[0].picture_blob) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const row = r.recordset[0];
    return new NextResponse(row.picture_blob, {
      headers: {
        "Content-Type": row.picture_mime || "image/jpeg",
        // Keyed on opaque line_user_id; LINE avatars change rarely, and the
        // webhook overwrites the blob when LINE pushes a new pictureUrl, so
        // a 1-day cache is safe and big enough to cut load on the list page.
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    console.error("GET /api/line-avatar/[lineUserId] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
