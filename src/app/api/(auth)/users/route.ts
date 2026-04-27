import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
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
function rolesFromRow(rawJson: string | null): string[] {
  if (!rawJson) return [];
  try { const p = JSON.parse(rawJson); return Array.isArray(p) ? p.filter(Boolean) : []; } catch { return []; }
}

async function isAdmin(db: Awaited<ReturnType<typeof getDb>>, userId: number) {
  const r = await db.request().input("id", sql.Int, userId)
    .query(`SELECT roles FROM users WHERE id = @id`);
  const roles = rolesFromRow(r.recordset[0]?.roles ?? null);
  return roles.includes("admin");
}

// GET /api/users — list mode (admin only): full user records with roles array.
//                  filter mode (any user): ?role=sales → shortlist of active users for pickers.
export async function GET(req: NextRequest) {
  try {
    const role = req.nextUrl.searchParams.get("role");
    const db = await getDb();

    if (role) {
      // Match any user that has this role in their JSON array.
      const r = await db.request().input("role", sql.NVarChar(30), role)
        .query(`
          SELECT id, username, full_name, team, roles
          FROM users
          WHERE is_active = 1 AND roles IS NOT NULL
            AND EXISTS (SELECT 1 FROM OPENJSON(roles) WHERE value = @role)
          ORDER BY full_name
        `);
      return NextResponse.json(r.recordset.map((u: { roles: string | null; [k: string]: unknown }) => ({
        ...u,
        roles: rolesFromRow(u.roles),
      })));
    }

    const userId = getUserIdFromReq(req);
    if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!(await isAdmin(db, userId))) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const users = await db.request().query(`
      SELECT u.id, u.username, u.full_name, u.team, u.phone, u.email, u.is_active, u.created_at, u.roles
      FROM users u
      ORDER BY u.is_active DESC, u.id
    `);
    const out = users.recordset.map((u: { roles: string | null; [k: string]: unknown }) => ({
      ...u,
      roles: rolesFromRow(u.roles),
    }));
    return NextResponse.json(fixDates(out as unknown as Array<Record<string, unknown>>));
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
    const roles = parseRoles(body.roles);
    if (roles.length === 0) return NextResponse.json({ error: "roles must contain ≥1 valid role" }, { status: 400 });

    const hash = hashPassword(String(body.password));
    const result = await db.request()
      .input("username", sql.NVarChar(50), body.username)
      .input("password_hash", sql.NVarChar(255), hash)
      .input("full_name", sql.NVarChar(100), body.full_name)
      .input("team", sql.NVarChar(50), body.team || "Sen X PM")
      .input("phone", sql.NVarChar(20), body.phone || null)
      .input("email", sql.NVarChar(150), body.email || null)
      .input("roles", sql.NVarChar(sql.MAX), JSON.stringify(roles))
      .query(`
        INSERT INTO users (username, password_hash, full_name, team, phone, email, roles)
        OUTPUT INSERTED.id
        VALUES (@username, @password_hash, @full_name, @team, @phone, @email, @roles)
      `);
    return NextResponse.json({ id: result.recordset[0].id }, { status: 201 });
  } catch (e) {
    console.error("POST /api/users error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
