import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { getUserIdFromReq, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

async function requireAdmin(req: NextRequest) {
  const userId = getUserIdFromReq(req);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const db = await getDb();
  const r = await db.request().input("id", sql.Int, userId)
    .query(`SELECT u.role, (SELECT COUNT(*) FROM user_roles WHERE user_id = u.id AND role = 'admin') as ur_admin
            FROM users u WHERE u.id = @id`);
  const row = r.recordset[0];
  if (!row || (row.role !== "admin" && row.ur_admin === 0)) {
    return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  }
  return { userId, db };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(req);
  if ("error" in gate) return gate.error;
  try {
    const { id } = await params;
    const body = await req.json();
    const targetId = parseInt(id);
    const db = gate.db;

    const sets: string[] = [];
    const request = db.request().input("id", sql.Int, targetId);

    if (body.full_name !== undefined) { sets.push("full_name = @full_name"); request.input("full_name", sql.NVarChar(100), body.full_name); }
    if (body.team !== undefined) { sets.push("team = @team"); request.input("team", sql.NVarChar(50), body.team); }
    if (body.role !== undefined) { sets.push("role = @role"); request.input("role", sql.NVarChar(20), body.role); }
    if (body.phone !== undefined) { sets.push("phone = @phone"); request.input("phone", sql.NVarChar(20), body.phone); }
    if (body.email !== undefined) { sets.push("email = @email"); request.input("email", sql.NVarChar(150), body.email); }
    if (body.is_active !== undefined) { sets.push("is_active = @is_active"); request.input("is_active", sql.Bit, body.is_active ? 1 : 0); }
    if (body.password) { sets.push("password_hash = @password_hash"); request.input("password_hash", sql.NVarChar(255), hashPassword(String(body.password))); }

    if (sets.length > 0) {
      sets.push("updated_at = GETDATE()");
      await request.query(`UPDATE users SET ${sets.join(", ")} WHERE id = @id`);
    }

    if (Array.isArray(body.extra_roles)) {
      await db.request().input("user_id", sql.Int, targetId)
        .query(`DELETE FROM user_roles WHERE user_id = @user_id`);
      for (const r of body.extra_roles as string[]) {
        await db.request().input("user_id", sql.Int, targetId).input("role", sql.NVarChar(30), r)
          .query(`INSERT INTO user_roles (user_id, role) VALUES (@user_id, @role)`);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/users/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// Soft-delete: flip is_active=0 so foreign keys (lead_activities.created_by, etc.) stay intact.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(req);
  if ("error" in gate) return gate.error;
  try {
    const { id } = await params;
    const targetId = parseInt(id);
    if (targetId === gate.userId) {
      return NextResponse.json({ error: "Cannot deactivate yourself" }, { status: 400 });
    }
    await gate.db.request().input("id", sql.Int, targetId)
      .query(`UPDATE users SET is_active = 0, updated_at = GETDATE() WHERE id = @id`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/users/[id] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
