import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAnyRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// ทีมช่าง — รายชื่อทีม สมาชิก และภาระงานที่ถืออยู่
// ★ ระบบสิทธิ์ของเขายังไม่มี role "ช่าง" (แผน 20260907_01) — สมาชิกทีมจึงผูกกับ users ตรง ๆ ไปก่อน
//   ใครเห็นงานของทีมไหน คุมที่หน้าจอ ยังไม่ได้คุมที่ระดับ API

const ADMIN = ["admin", "solar_sup", "sales_sup"] as const;

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const db = await getOmDb();
  const r = await db.request().query(`
    SELECT t.id, t.name, t.color, t.center_id, CAST(t.is_active AS int) is_active,
           t.capacity_override, sc.name center_name,
           (SELECT COUNT(*) FROM om_bookings b WHERE b.team_id = t.id
              AND b.status IN ('pending','confirmed','progress','checked')) open_jobs,
           (SELECT COUNT(*) FROM om_bookings b WHERE b.team_id = t.id
              AND b.status = 'closed') done_jobs
    FROM om_teams t LEFT JOIN om_service_centers sc ON sc.id = t.center_id
    ORDER BY t.is_active DESC, t.id;

    SELECT m.id, m.team_id, m.user_id, m.role, u.full_name, u.username
    FROM om_team_members m LEFT JOIN users u ON u.id = m.user_id
    WHERE m.is_current = 1 ORDER BY m.team_id, m.id;

    SELECT id, full_name, username FROM users WHERE is_active = 1 ORDER BY full_name;`);
  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  return NextResponse.json({ teams: rs[0], members: rs[1], users: rs[2] });
}

// POST { name, color?, center_id? }            — เพิ่มทีม
// POST { team_id, user_id, role? }             — เพิ่มสมาชิกเข้าทีม
export async function POST(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));
  const db = await getOmDb();

  if (b.team_id && b.user_id) {
    const dup = (await db.request().input("t", sql.Int, Number(b.team_id)).input("u", sql.Int, Number(b.user_id))
      .query(`SELECT TOP 1 id FROM om_team_members WHERE team_id = @t AND user_id = @u AND is_current = 1`)).recordset[0];
    if (dup) return NextResponse.json({ error: "คนนี้อยู่ในทีมนี้แล้ว" }, { status: 409 });
    const r = await db.request().input("t", sql.Int, Number(b.team_id)).input("u", sql.Int, Number(b.user_id))
      .input("r", sql.NVarChar(20), typeof b.role === "string" && b.role.trim() ? b.role.trim() : "member")
      .query(`INSERT INTO om_team_members (team_id, user_id, role, is_current) OUTPUT INSERTED.id VALUES (@t, @u, @r, 1)`);
    return NextResponse.json({ ok: true, id: r.recordset[0].id });
  }

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) return NextResponse.json({ error: "ต้องระบุชื่อทีม" }, { status: 400 });
  const r = await db.request().input("n", sql.NVarChar(100), name)
    .input("c", sql.NVarChar(20), typeof b.color === "string" && b.color.trim() ? b.color.trim() : "#6b7280")
    .input("ct", sql.Int, b.center_id ? Number(b.center_id) : 1)
    .query(`INSERT INTO om_teams (name, color, center_id, is_active) OUTPUT INSERTED.id VALUES (@n, @c, @ct, 1)`);
  return NextResponse.json({ ok: true, id: r.recordset[0].id });
}

// PATCH { team_id, name?, color?, is_active? }  — แก้ทีม
// PATCH { member_id, remove: true }             — เอาคนออกจากทีม (ไม่ลบประวัติ)
export async function PATCH(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));
  const db = await getOmDb();

  if (b.member_id && b.remove === true) {
    await db.request().input("m", sql.Int, Number(b.member_id))
      .query(`UPDATE om_team_members SET is_current = 0 WHERE id = @m`);
    return NextResponse.json({ ok: true });
  }

  const id = Number(b.team_id);
  if (!id) return NextResponse.json({ error: "ต้องระบุ team_id" }, { status: 400 });
  const set: string[] = [];
  if (typeof b.name === "string" && b.name.trim()) set.push("name = @n");
  if (typeof b.color === "string" && b.color.trim()) set.push("color = @c");
  if (typeof b.is_active === "boolean") set.push("is_active = @a");
  if (!set.length) return NextResponse.json({ ok: true, unchanged: true });

  await db.request().input("id", sql.Int, id)
    .input("n", sql.NVarChar(100), typeof b.name === "string" ? b.name.trim() : null)
    .input("c", sql.NVarChar(20), typeof b.color === "string" ? b.color.trim() : null)
    .input("a", sql.Bit, b.is_active === true ? 1 : 0)
    .query(`UPDATE om_teams SET ${set.join(", ")} WHERE id = @id`);
  return NextResponse.json({ ok: true, id });
}
