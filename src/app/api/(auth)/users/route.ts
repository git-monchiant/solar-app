import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { getUserIdFromReq, hashPassword } from "@/lib/auth";

export const runtime = "nodejs";

async function isAdmin(db: Awaited<ReturnType<typeof getDb>>, userId: number) {
  const r = await db.request().input("id", sql.Int, userId)
    .query(`SELECT u.role, (SELECT COUNT(*) FROM user_roles WHERE user_id = u.id AND role = 'admin') as ur_admin
            FROM users u WHERE u.id = @id`);
  const row = r.recordset[0];
  return !!row && (row.role === "admin" || row.ur_admin > 0);
}

// GET /api/users — list mode (admin): returns full user records w/ extra_roles.
//                  filter mode (any user): ?role=sales → shortlist of active users (used by pickers).
export async function GET(req: NextRequest) {
  try {
    const role = req.nextUrl.searchParams.get("role");
    const db = await getDb();

    if (role) {
      const r = await db.request().input("role", sql.NVarChar(30), role)
        .query(`SELECT id, username, full_name, team, role FROM users WHERE role = @role AND is_active = 1 ORDER BY full_name`);
      return NextResponse.json(r.recordset);
    }

    const userId = getUserIdFromReq(req);
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!(await isAdmin(db, userId))) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const users = await db.request().query(`
      SELECT u.id, u.username, u.full_name, u.team, u.role, u.phone, u.email, u.is_active, u.created_at,
             (SELECT STRING_AGG(role, ',') FROM user_roles WHERE user_id = u.id) as extra_roles
      FROM users u
      ORDER BY u.is_active DESC, u.id
    `);
    return NextResponse.json(fixDates(users.recordset));
  } catch (e) {
    console.error("GET /api/users error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserIdFromReq(req);
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const db = await getDb();
    if (!(await isAdmin(db, userId))) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const body = await req.json();
    if (!body.username || !body.password || !body.full_name) {
      return NextResponse.json({ error: "username, password, full_name required" }, { status: 400 });
    }
    const hash = hashPassword(String(body.password));
    const result = await db.request()
      .input("username", sql.NVarChar(50), body.username)
      .input("password_hash", sql.NVarChar(255), hash)
      .input("full_name", sql.NVarChar(100), body.full_name)
      .input("team", sql.NVarChar(50), body.team || "Sen X PM")
      .input("role", sql.NVarChar(20), body.role || "sales")
      .input("phone", sql.NVarChar(20), body.phone || null)
      .input("email", sql.NVarChar(150), body.email || null)
      .query(`
        INSERT INTO users (username, password_hash, full_name, team, role, phone, email)
        OUTPUT INSERTED.id
        VALUES (@username, @password_hash, @full_name, @team, @role, @phone, @email)
      `);
    const newId: number = result.recordset[0].id;

    if (Array.isArray(body.extra_roles)) {
      for (const r of body.extra_roles as string[]) {
        await db.request().input("user_id", sql.Int, newId).input("role", sql.NVarChar(30), r)
          .query(`INSERT INTO user_roles (user_id, role) VALUES (@user_id, @role)`);
      }
    }

    return NextResponse.json({ id: newId }, { status: 201 });
  } catch (e) {
    console.error("POST /api/users error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
