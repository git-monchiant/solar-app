import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { getUserIdFromReq, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

const VALID_ROLES = new Set(["admin", "sales", "solar", "leadsseeker"]);
function parseRoles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const r of raw) {
    if (typeof r === "string" && VALID_ROLES.has(r) && !out.includes(r)) out.push(r);
  }
  return out;
}

async function requireAdmin(req: NextRequest) {
  const userId = getUserIdFromReq(req);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const db = await getDb();
  const r = await db.request().input("id", sql.Int, userId)
    .query(`SELECT roles FROM users WHERE id = @id`);
  let roles: string[] = [];
  if (r.recordset[0]?.roles) {
    try { const p = JSON.parse(r.recordset[0].roles); if (Array.isArray(p)) roles = p; } catch {}
  }
  if (!roles.includes("admin")) {
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
    if (body.phone !== undefined) { sets.push("phone = @phone"); request.input("phone", sql.NVarChar(20), body.phone); }
    if (body.email !== undefined) { sets.push("email = @email"); request.input("email", sql.NVarChar(150), body.email); }
    if (body.signature_url !== undefined) { sets.push("signature_url = @signature_url"); request.input("signature_url", sql.NVarChar(500), body.signature_url); }
    if (body.is_active !== undefined) { sets.push("is_active = @is_active"); request.input("is_active", sql.Bit, body.is_active ? 1 : 0); }
    if (body.password) { sets.push("password_hash = @password_hash"); request.input("password_hash", sql.NVarChar(255), hashPassword(String(body.password))); }
    if (body.roles !== undefined) {
      const roles = parseRoles(body.roles);
      if (roles.length === 0) {
        return NextResponse.json({ error: "roles must contain ≥1 valid role" }, { status: 400 });
      }
      // Protect the default `admin` account from losing the admin role —
      // there must always be at least one guaranteed admin login.
      const check = await db.request().input("id", sql.Int, targetId)
        .query(`SELECT username FROM users WHERE id = @id`);
      const targetUsername = check.recordset[0]?.username;
      if (targetUsername === "admin" && !roles.includes("admin")) {
        return NextResponse.json({ error: "ไม่สามารถลบ role admin ออกจาก user 'admin'" }, { status: 400 });
      }
      sets.push("roles = @roles");
      request.input("roles", sql.NVarChar(sql.MAX), JSON.stringify(roles));
    }

    if (sets.length > 0) {
      sets.push("updated_at = GETDATE()");
      await request.query(`UPDATE users SET ${sets.join(", ")} WHERE id = @id`);
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
