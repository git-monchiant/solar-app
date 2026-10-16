import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAnyRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// วันที่ทำงานไม่ได้ — ★ ตารางเดียว om_calendar_blocks (ยุบ om_holidays + om_team_offdays มารวมกัน 10 ก.ย. 69)
//   kind: holiday = ทั้งบริษัท · team_off = ทีมนั้นหยุด · center_off = ศูนย์นั้นปิด
const ADMIN = ["admin", "solar_sup", "sales_sup"] as const;
const KINDS = ["holiday", "team_off", "center_off"];

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const past = req.nextUrl.searchParams.get("past") === "1";
  const db = await getOmDb();
  const r = await db.request().query(`
    SELECT cb.id, cb.kind, CONVERT(char(10), cb.block_date, 23) block_date,
           CONVERT(char(10), cb.end_date, 23) end_date, cb.title, cb.time_slot, cb.note,
           cb.team_id, t.name team_name, cb.center_id, sc.name center_name,
           CONVERT(char(10), cb.created_at, 23) created_at
    FROM om_calendar_blocks cb
    LEFT JOIN om_teams t ON t.id = cb.team_id
    LEFT JOIN om_service_centers sc ON sc.id = cb.center_id
    ${past ? "" : "WHERE ISNULL(cb.end_date, cb.block_date) >= CAST(SYSDATETIMEOFFSET() AS date)"}
    ORDER BY cb.block_date, cb.id`);
  return NextResponse.json({ blocks: r.recordset });
}

// POST { kind, block_date, end_date?, title, team_id?, center_id?, time_slot?, note? }
export async function POST(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));
  const kind = String(b.kind ?? "holiday");
  const date = String(b.block_date ?? "").slice(0, 10);
  const title = String(b.title ?? "").trim();
  if (!KINDS.includes(kind)) return NextResponse.json({ error: "ชนิดไม่ถูกต้อง" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "ต้องระบุวันที่" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "ต้องใส่ชื่อ เช่น วันสงกรานต์" }, { status: 400 });
  if (kind === "team_off" && !b.team_id) return NextResponse.json({ error: "ทีมหยุดต้องเลือกทีม" }, { status: 400 });

  const db = await getOmDb();
  const r = await db.request()
    .input("k", sql.NVarChar(16), kind).input("d", sql.Date, date)
    .input("e", sql.Date, b.end_date ? String(b.end_date).slice(0, 10) : null)
    .input("t", sql.NVarChar(120), title)
    .input("tm", sql.Int, b.team_id ? Number(b.team_id) : null)
    .input("ct", sql.Int, b.center_id ? Number(b.center_id) : null)
    .input("ts", sql.NVarChar(60), b.time_slot ? String(b.time_slot).slice(0, 60) : null)
    .input("n", sql.NVarChar(300), b.note ? String(b.note).slice(0, 300) : null)
    .input("u", sql.Int, gate.userId ?? null)
    .query(`INSERT INTO om_calendar_blocks (kind, block_date, end_date, title, team_id, center_id, time_slot, note, created_by)
            OUTPUT INSERTED.id VALUES (@k, @d, @e, @t, @tm, @ct, @ts, @n, @u)`);
  return NextResponse.json({ ok: true, id: r.recordset[0].id }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const db = await getOmDb();
  await db.request().input("id", sql.Int, id).query(`DELETE FROM om_calendar_blocks WHERE id = @id`);
  return NextResponse.json({ ok: true });
}
