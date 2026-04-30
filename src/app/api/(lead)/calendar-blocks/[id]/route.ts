import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const { id } = await params;
  const db = await getDb();
  await db.request().input("id", sql.Int, parseInt(id))
    .query(`DELETE FROM calendar_blocks WHERE id = @id`);
  return NextResponse.json({ ok: true });
}
