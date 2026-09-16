import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { logBooking } from "@/lib/om/booking-log";
import { ACTIVE_STATUS, ALL_STATUS, toThaiOffset } from "@/lib/om/booking";

// งานบริการ O&M — ลิสต์ + สร้างนัด
// ★ กติกาที่ต้องรักษา (CLAUDE.md): เวลานัดใช้ +07:00 เสมอ · ห้ามจองซ้ำประเภทเดียวกันถ้ายังมีงานค้าง
//   ประเภทงานเป็น lookup ในฐาน เพิ่มชนิดใหม่ไม่ต้องแก้โค้ด

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const u = req.nextUrl.searchParams;
  const status = (u.get("status") ?? "").trim();
  const team = (u.get("team") ?? "").trim();
  const q = (u.get("q") ?? "").trim();
  const from = u.get("from");   // yyyy-mm-dd
  const to = u.get("to");
  const page = Math.max(1, Number(u.get("page") ?? 1));
  const size = Math.min(200, Math.max(10, Number(u.get("size") ?? 50)));

  const where: string[] = ["1=1"];
  if (status && ALL_STATUS.includes(status)) where.push("b.status = @st");
  if (team === "none") where.push("b.team_id IS NULL");
  else if (team) where.push("b.team_id = @team");
  if (from) where.push("b.scheduled_at >= @from");
  if (to) where.push("b.scheduled_at < DATEADD(day, 1, @to)");
  if (q) where.push(`(h.house_number LIKE @q OR c.full_name LIKE @q OR h.project_name LIKE @q)`);

  const db = await getOmDb();
  const rq = db.request().input("off", sql.Int, (page - 1) * size).input("n", sql.Int, size);
  if (status) rq.input("st", sql.NVarChar(20), status);
  if (team && team !== "none") rq.input("team", sql.Int, Number(team));
  if (from) rq.input("from", sql.Date, from);
  if (to) rq.input("to", sql.Date, to);
  if (q) rq.input("q", sql.NVarChar(120), `%${q}%`);

  // ★ CTE มีผลแค่ statement แรกของ batch — batch นี้มีหลาย statement จึงต้องพักไว้ใน temp table
  const r = await rq.query(`
    SELECT b.id, b.house_id, b.service_type_id, b.status, b.note, b.queue_index,
           b.rescheduled_count, b.source, b.cancelled_reason, b.team_id, b.scheduled_at, b.created_at,
           h.house_number, h.project_id, ISNULL(pj.name_th, h.project_name) project_name,
           st.label_th service_type, CAST(st.consumes_quota AS int) consumes_quota,
           t.name team_name, t.color team_color,
           c.full_name customer_name, cp.phone customer_phone
    INTO #B
    FROM om_bookings b
    JOIN om_houses h ON h.id = b.house_id
    LEFT JOIN om_projects pj ON pj.project_id = h.project_id
    LEFT JOIN om_service_type st ON st.id = b.service_type_id
    LEFT JOIN om_teams t ON t.id = b.team_id
    OUTER APPLY (SELECT TOP 1 cc.full_name, cc.id FROM om_house_customers hc
                 JOIN om_customers cc ON cc.id = hc.customer_id
                 WHERE hc.house_id = h.id AND hc.is_current = 1
                 ORDER BY CASE hc.role WHEN 'owner' THEN 0 ELSE 1 END, hc.id) c
    OUTER APPLY (SELECT TOP 1 phone FROM om_customer_phones p
                 WHERE p.customer_id = c.id ORDER BY p.is_primary DESC, p.id) cp
    WHERE ${where.join(" AND ")};

    SELECT COUNT(*) total FROM #B;

    SELECT id, house_id, house_number, project_id, project_name,
           service_type_id, service_type, consumes_quota, status,
           CONVERT(varchar(33), scheduled_at, 126) scheduled_at,
           team_id, team_name, team_color, queue_index, note,
           rescheduled_count, source, cancelled_reason,
           customer_name, customer_phone,
           CONVERT(varchar(33), created_at, 126) created_at
    FROM #B
    ORDER BY CASE WHEN scheduled_at IS NULL THEN 1 ELSE 0 END, scheduled_at, queue_index, id
    OFFSET @off ROWS FETCH NEXT @n ROWS ONLY;

    SELECT status, COUNT(*) n FROM om_bookings GROUP BY status;

    -- cycle_months = รอบของงานชนิดนั้น (ล้างแผง 6 เดือน) · NULL = ไม่มีรอบ เช่น ซ่อม
    SELECT id, label_th, code, CAST(consumes_quota AS int) consumes_quota, cycle_months
    FROM om_service_type WHERE active = 1 ORDER BY sort_order, id;

    SELECT t.id, t.name, t.color, t.center_id,
           (SELECT COUNT(*) FROM om_team_members m WHERE m.team_id = t.id AND m.is_current = 1) members
    FROM om_teams t WHERE t.is_active = 1 ORDER BY t.id;

    -- ★ ช่วงเวลา + ความจุ มาจาก om_slot_config เสมอ (กติกาโปรเจกต์ ห้าม hardcode)
    --   weekday 0=อาทิตย์ … 6=เสาร์ · center_id NULL = ใช้กับทุกศูนย์
    SELECT id, center_id, weekday,
           CONVERT(char(5), start_time, 108) start_time,
           CONVERT(char(5), end_time, 108) end_time,
           capacity, CAST(is_open AS int) is_open
    FROM om_slot_config ORDER BY weekday, start_time;

    DROP TABLE #B;`);

  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  return NextResponse.json({
    total: (rs[0][0] as { total: number }).total,
    rows: fixDates(rs[1]),
    counts: rs[2],
    serviceTypes: rs[3],
    teams: rs[4],
    slots: rs[5],
    page, size,
  });
}

// POST { house_id, service_type_id, scheduled_at?, status?, note?, team_id? }
//   ไม่ส่ง scheduled_at = งานติดตาม (ยังไม่มีวันนัด) → status follow
export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));
  const houseId = Number(b.house_id);
  const typeId = Number(b.service_type_id);
  if (!houseId || !typeId) return NextResponse.json({ error: "ต้องระบุบ้านและประเภทงาน" }, { status: 400 });
  const when = toThaiOffset(b.scheduled_at);
  const status = when ? (typeof b.status === "string" && ALL_STATUS.includes(b.status) ? b.status : "pending") : "follow";

  const db = await getOmDb();
  const house = (await db.request().input("h", sql.Int, houseId)
    .query(`SELECT id, house_number FROM om_houses WHERE id = @h AND is_om = 1`)).recordset[0];
  if (!house) return NextResponse.json({ error: "ไม่พบบ้านหลังนี้ในระบบ O&M" }, { status: 404 });

  // ★ กติกา: ห้ามจองซ้ำประเภทเดียวกันถ้ายังมีงานค้างอยู่
  const dup = (await db.request().input("h", sql.Int, houseId).input("t", sql.Int, typeId)
    .query(`SELECT TOP 1 id, status FROM om_bookings
            WHERE house_id = @h AND service_type_id = @t
              AND status IN (${ACTIVE_STATUS.map((s) => `'${s}'`).join(",")})`)).recordset[0];
  if (dup) return NextResponse.json({ error: `บ้านหลังนี้มีงานประเภทเดียวกันค้างอยู่แล้ว (งาน #${dup.id})` }, { status: 409 });

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const ins = await new sql.Request(tx)
      .input("h", sql.Int, houseId).input("t", sql.Int, typeId)
      .input("w", sql.DateTimeOffset, when).input("s", sql.NVarChar(20), status)
      .input("n", sql.NVarChar(sql.MAX), typeof b.note === "string" ? b.note.trim() || null : null)
      .input("tm", sql.Int, b.team_id ? Number(b.team_id) : null)
      .input("u", sql.Int, gate.userId ?? null)
      .query(`INSERT INTO om_bookings (house_id, service_type_id, scheduled_at, status, note, team_id, created_by, source)
              OUTPUT INSERTED.id VALUES (@h, @t, @w, @s, @n, @tm, @u, 'admin')`);
    const id = ins.recordset[0].id as number;
    await logBooking(tx, { bookingId: id, action: "create", actorUserId: gate.userId ?? null,
      to: { status, scheduled_at: when, team_id: b.team_id ?? null } });
    await tx.commit();
    return NextResponse.json({ ok: true, id, status });
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e instanceof Error ? e.message : "สร้างนัดไม่สำเร็จ" }, { status: 500 });
  }
}
