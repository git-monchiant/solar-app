import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: "username and password required" }, { status: 400 });
    }
    const db = await getDb();
    const r = await db.request().input("username", sql.NVarChar(50), String(username))
      .query(`SELECT id, username, full_name, team, phone, email, password_hash, is_active, roles
              FROM users WHERE username = @username`);
    if (r.recordset.length === 0) {
      return NextResponse.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
    }
    const u = r.recordset[0];
    if (!u.is_active) {
      return NextResponse.json({ error: "บัญชีถูกระงับการใช้งาน" }, { status: 403 });
    }
    if (!verifyPassword(String(password), u.password_hash)) {
      return NextResponse.json({ error: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" }, { status: 401 });
    }
    let roles: string[] = [];
    if (u.roles) {
      try { const p = JSON.parse(u.roles); if (Array.isArray(p)) roles = p; } catch {}
    }
    return NextResponse.json({
      id: u.id,
      username: u.username,
      full_name: u.full_name,
      team: u.team,
      phone: u.phone,
      email: u.email,
      roles,
    });
  } catch (e) {
    console.error("POST /api/login error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
