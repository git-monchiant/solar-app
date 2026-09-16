import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { CLEANING_CYCLE_SQL, isCleaning } from "@/lib/om/entitlement";
import { getSettings } from "@/lib/om/settings";
import { logBooking } from "@/lib/om/booking-log";
import { toThaiOffset } from "@/lib/om/booking";

// แท็บ "ติดตาม" ของงานบริการ — ★ การ์ดคำนวณสด ไม่มีแถวงานรอไว้ล่วงหน้า
//   เกณฑ์: บ้าน O&M ที่มีระบบติดตั้ง + เลยรอบล้าง (om_service_type.cycle_months)
// ★ ผู้ใช้เคาะ 10 ก.ย. 69: ไม่มี "รอบโทร" ไม่มีเจ้าของงาน — ใครเปิดหน้านี้ก็โทรต่อได้
//   ประวัติการโทรอยู่ที่ om_booking_history (booking_id ว่างได้ ผูกกับ house_id แทน)
//   ⇒ ไม่มีตาราง om_call_log แยก

const OUTCOME = ["agreed", "postponed", "no_answer", "declined", "wrong_number"] as const;
type Outcome = (typeof OUTCOME)[number];

const SORT: Record<string, string> = {
  overdue: "d.last_wash ASC, d.house_number",            // ค้างนานสุดก่อน (ไม่เคยล้าง = ค้างสุด)
  recent:  "d.last_wash DESC, d.house_number",           // เพิ่งถึงรอบก่อน
  quota:   "d.balance DESC, d.last_wash ASC",            // สิทธิ์เหลือมากก่อน
  project: "d.project_name, d.house_number",
  house:   "d.house_number",
};

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const u = req.nextUrl.searchParams;
  const tab = (u.get("tab") ?? "follow").trim();
  const group = (u.get("group") ?? "").trim();
  const q = (u.get("q") ?? "").trim();
  const sort = SORT[u.get("sort") ?? "overdue"] ?? SORT.overdue;
  const page = Math.max(1, Number(u.get("page")) || 1);
  const size = Math.min(100, Math.max(10, Number(u.get("size")) || 30));

  const cfg = await getSettings("call.");
  const maxAttempts = Number(cfg["call.max_attempts"] ?? 3);

  const db = await getOmDb();
  try {
  const r = await db.request()
    .input("g", sql.NVarChar(20), group)
    .input("tab", sql.VarChar(20), tab)
    .input("q", sql.NVarChar(80), q ? `%${q}%` : "")
    .input("max", sql.Int, maxAttempts)
    .input("off", sql.Int, (page - 1) * size)
    .input("size", sql.Int, size)
    .query(`
    -- ① บ้านที่ถึงรอบล้าง (คำนวณสด) + สิทธิ์คงเหลือ + ล้างล่าสุด + เบอร์
    SELECT h.id house_id, h.house_number, h.project_id,
           ISNULL(pj.name_th, h.project_name) project_name,
           (SELECT ISNULL(SUM(g.qty), 0) FROM om_entitlement_grants g
             JOIN om_installations i ON i.id = g.installation_id
            WHERE i.house_id = h.id AND ${isCleaning("g")})
           - (SELECT COUNT(*) FROM om_redemptions rd
               JOIN om_installations i ON i.id = rd.installation_id
              WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isCleaning("rd")}) balance,
           (SELECT CONVERT(char(10), MAX(rd.service_date), 23) FROM om_redemptions rd
             JOIN om_installations i ON i.id = rd.installation_id
            WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isCleaning("rd")}) last_wash,
           (SELECT COUNT(*) FROM om_redemptions rd
             JOIN om_installations i ON i.id = rd.installation_id
            WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isCleaning("rd")}) wash_count,
           (SELECT TOP 1 c.id FROM om_house_customers hc JOIN om_customers c ON c.id = hc.customer_id
             WHERE hc.house_id = h.id AND hc.is_current = 1
             ORDER BY CASE hc.role WHEN 'owner' THEN 0 ELSE 1 END, hc.id) customer_id,
           (SELECT TOP 1 c.full_name FROM om_house_customers hc JOIN om_customers c ON c.id = hc.customer_id
             WHERE hc.house_id = h.id AND hc.is_current = 1
             ORDER BY CASE hc.role WHEN 'owner' THEN 0 ELSE 1 END, hc.id) customer_name,
           (SELECT TOP 1 p.phone FROM om_house_customers hc
             JOIN om_customer_phones p ON p.customer_id = hc.customer_id
            WHERE hc.house_id = h.id AND hc.is_current = 1 AND p.status <> 'invalid'
            ORDER BY p.is_primary DESC, p.id) phone,
           (SELECT STRING_AGG(CAST(COALESCE(i.rem_size_kwp, i.promo_size_kw) AS varchar(12)), ' + ')
              FROM om_installations i WHERE i.house_id = h.id
               AND COALESCE(i.rem_size_kwp, i.promo_size_kw) IS NOT NULL) kwp_list,
           (SELECT MIN(CONVERT(char(10), i.warranty_start, 23)) FROM om_installations i
             WHERE i.house_id = h.id AND i.warranty_start IS NOT NULL) warranty_start
      INTO #due
      FROM om_houses h
      LEFT JOIN om_projects pj ON pj.project_id = h.project_id
     WHERE h.is_om = 1
       AND EXISTS (SELECT 1 FROM om_installations i WHERE i.house_id = h.id)
       AND (
         -- ถึงรอบล้าง (คำนวณสด)
         NOT EXISTS (
             SELECT 1 FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id
              WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isCleaning("rd")}
                AND DATEADD(month, ${CLEANING_CYCLE_SQL}, rd.service_date) > SYSDATETIMEOFFSET())
         -- หรือมีใบงานค้างอยู่ (เช่น งานซ่อมของบ้านที่ยังไม่ถึงรอบล้าง)
         OR EXISTS (SELECT 1 FROM om_bookings b WHERE b.house_id = h.id
                     AND b.status IN ('follow','pending','confirmed','progress','checked'))
         OR EXISTS (SELECT 1 FROM om_bookings b WHERE b.house_id = h.id AND b.status = 'closed'
                     AND DATEDIFF(day, b.updated_at, SYSDATETIMEOFFSET()) <= 90));

    -- ② สรุปการโทรของแต่ละบ้าน (ประวัติอยู่ใน om_booking_history ผูกกับ house_id)
    SELECT bh.house_id,
           COUNT(*) calls,
           SUM(CASE WHEN JSON_VALUE(bh.to_json, '$.outcome') = 'no_answer' THEN 1 ELSE 0 END) no_answer,
           MAX(bh.created_at) last_call_at,
           MAX(bh.next_action_date) next_call
      INTO #call
      FROM om_booking_history bh
     WHERE bh.house_id IS NOT NULL AND bh.[action] = 'call'
     GROUP BY bh.house_id;

    SELECT bh.house_id, JSON_VALUE(bh.to_json, '$.outcome') outcome, u.full_name by_name,
           CONVERT(varchar(33), bh.created_at, 126) at
      INTO #last
      FROM om_booking_history bh
      LEFT JOIN users u ON u.id = bh.actor_user_id
     WHERE bh.house_id IS NOT NULL AND bh.[action] = 'call'
       AND bh.id = (SELECT MAX(b2.id) FROM om_booking_history b2
                     WHERE b2.house_id = bh.house_id AND b2.[action] = 'call');

    -- ③ ใบงานที่เปิดค้างอยู่ของบ้านนั้น
    -- ใบงานล่าสุดของบ้าน (งานค้างมาก่อน ถ้าไม่มีค่อยเอางานที่เพิ่งปิด)
    SELECT b.house_id, b.id booking_id, b.status,
           CONVERT(varchar(33), b.scheduled_at, 126) scheduled_at,
           b.team_id, t.name team_name, st.label_th service_type
      INTO #job
      FROM om_bookings b
      LEFT JOIN om_teams t ON t.id = b.team_id
      LEFT JOIN om_service_type st ON st.id = b.service_type_id
     WHERE b.id = (SELECT TOP 1 b2.id FROM om_bookings b2
                    WHERE b2.house_id = b.house_id
                    ORDER BY CASE WHEN b2.status IN ('follow','pending','confirmed','progress','checked')
                                  THEN 0 ELSE 1 END, b2.id DESC);

    -- ④ รวมร่าง + จัดว่าแต่ละหลังอยู่แท็บไหน
    SELECT d.*, ISNULL(c.calls, 0) calls, ISNULL(c.no_answer, 0) no_answer,
           CONVERT(varchar(33), c.last_call_at, 126) last_call_at,
           CONVERT(char(10), c.next_call, 23) next_call,
           l.outcome last_outcome, l.by_name last_by,
           j.booking_id, j.status job_status, j.scheduled_at, j.team_id, j.team_name, j.service_type,
           CASE
             -- ใบงานเดินหน้าแล้วให้ยึดสถานะใบงานเป็นหลัก (ออกจากแท็บติดตาม)
             WHEN j.status IN ('pending','confirmed','progress','checked','closed') THEN j.status
             WHEN l.outcome = 'declined'                      THEN 'declined'
             WHEN d.phone IS NULL OR l.outcome = 'wrong_number' THEN 'unreachable'
             WHEN ISNULL(c.no_answer, 0) >= @max              THEN 'unreachable'
             WHEN d.balance <= 0                              THEN 'noquota'
             ELSE 'follow'
           END bucket
      INTO #x
      FROM #due d
      LEFT JOIN #call c ON c.house_id = d.house_id
      LEFT JOIN #last l ON l.house_id = d.house_id
      LEFT JOIN #job  j ON j.house_id = d.house_id;

    SELECT bucket, COUNT(*) n FROM #x GROUP BY bucket;

    SELECT COUNT(*) total FROM #x d
     WHERE d.bucket = @tab
       AND (@g = '' OR d.project_id = @g)
       AND (@q = '' OR d.house_number LIKE @q OR d.customer_name LIKE @q OR d.phone LIKE @q);

    SELECT d.* FROM #x d
     WHERE d.bucket = @tab
       AND (@g = '' OR d.project_id = @g)
       AND (@q = '' OR d.house_number LIKE @q OR d.customer_name LIKE @q OR d.phone LIKE @q)
     ORDER BY ${sort}
     OFFSET @off ROWS FETCH NEXT @size ROWS ONLY;

    SELECT d.project_id, MAX(d.project_name) project_name, COUNT(*) n
      FROM #x d WHERE d.bucket = 'follow' GROUP BY d.project_id ORDER BY n DESC;

    DROP TABLE #due; DROP TABLE #call; DROP TABLE #last; DROP TABLE #job; DROP TABLE #x;`);

  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  const counts: Record<string, number> = {};
  for (const x of rs[0]) counts[String(x.bucket)] = Number(x.n);
  return NextResponse.json({
    counts,
    total: Number(rs[1][0]?.total ?? 0),
    items: fixDates(rs[2]),
    projects: rs[3],
    rules: cfg,
    page, size,
  });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "อ่านรายการติดตามไม่สำเร็จ" }, { status: 500 });
  }
}

// POST — บันทึกผลการโทร 1 ครั้ง
// { house_id, outcome, note?, next_date?, scheduled_at?, service_type_id? }
// ★ แถวงานเกิดเฉพาะตอน "ตกลงนัด" หรือ "ขอเลื่อน" — ไม่รับสาย/ปฏิเสธ บันทึกประวัติอย่างเดียว
export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));
  const houseId = Number(b.house_id);
  const outcome = String(b.outcome ?? "") as Outcome;
  if (!houseId || !OUTCOME.includes(outcome))
    return NextResponse.json({ error: "ต้องระบุบ้านและผลการโทร" }, { status: 400 });

  const cfg = await getSettings("call.");
  const retryDays = Number(cfg["call.retry_days"] ?? 3);
  const postponeDays = Number(cfg["call.postpone_days"] ?? 30);

  const db = await getOmDb();
  const house = (await db.request().input("h", sql.Int, houseId)
    .query(`SELECT id, house_number FROM om_houses WHERE id = @h AND is_om = 1`)).recordset[0];
  if (!house) return NextResponse.json({ error: "ไม่พบบ้านหลังนี้" }, { status: 404 });

  // วันนัดโทรครั้งหน้า — ลูกค้าระบุเองมาก่อน ไม่งั้นใช้กติกาในตั้งค่า
  const auto = outcome === "no_answer" ? retryDays : outcome === "postponed" ? postponeDays : null;
  const next = b.next_date
    ? String(b.next_date).slice(0, 10)
    : auto !== null
      ? new Date(Date.now() + auto * 86400000).toISOString().slice(0, 10)
      : null;

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    let bookingId: number | null = b.booking_id ? Number(b.booking_id) : null;

    if (outcome === "agreed" || outcome === "postponed") {
      const typeId = Number(b.service_type_id) ||
        (await new sql.Request(tx).query(
          `SELECT TOP 1 id FROM om_service_type WHERE code = 'cleaning'`)).recordset[0].id;
      const when = outcome === "agreed" ? toThaiOffset(b.scheduled_at) : null;
      const status = outcome === "agreed" ? "pending" : "follow";

      const cur = (await new sql.Request(tx).input("h", sql.Int, houseId).input("t", sql.Int, typeId)
        .query(`SELECT TOP 1 id FROM om_bookings
                 WHERE house_id = @h AND service_type_id = @t
                   AND status IN ('follow','pending','confirmed','progress','checked')`)).recordset[0];

      if (cur) {
        bookingId = cur.id as number;
        await new sql.Request(tx).input("id", sql.Int, bookingId)
          .input("s", sql.NVarChar(20), status).input("w", sql.DateTimeOffset, when)
          .query(`UPDATE om_bookings SET status = @s,
                    scheduled_at = COALESCE(@w, scheduled_at), updated_at = SYSDATETIMEOFFSET()
                  WHERE id = @id`);
      } else {
        const ins = await new sql.Request(tx)
          .input("h", sql.Int, houseId).input("t", sql.Int, typeId)
          .input("w", sql.DateTimeOffset, when).input("s", sql.NVarChar(20), status)
          .input("u", sql.Int, gate.userId ?? null)
          .query(`INSERT INTO om_bookings (house_id, service_type_id, scheduled_at, status, created_by, source)
                  OUTPUT INSERTED.id VALUES (@h, @t, @w, @s, @u, 'call')`);
        bookingId = ins.recordset[0].id as number;
      }
    }

    // เบอร์ผิด → ทำเครื่องหมายว่าใช้ไม่ได้ (ไม่ลบทิ้ง เก็บไว้ในประวัติ)
    if (outcome === "wrong_number" && b.phone)
      await new sql.Request(tx).input("h", sql.Int, houseId).input("p", sql.NVarChar(20), String(b.phone))
        .query(`UPDATE p SET p.status = 'invalid'
                FROM om_customer_phones p
                JOIN om_house_customers hc ON hc.customer_id = p.customer_id
                WHERE hc.house_id = @h AND hc.is_current = 1 AND p.phone = @p`);

    await logBooking(tx, {
      bookingId, houseId, action: "call", actorUserId: gate.userId ?? null,
      to: { outcome, next_date: next, scheduled_at: b.scheduled_at ?? null },
      reason: typeof b.note === "string" ? b.note.trim() || null : null,
      nextActionDate: next,
    });
    await tx.commit();
    return NextResponse.json({ ok: true, booking_id: bookingId, next_date: next });
  } catch (e) {
    await tx.rollback().catch(() => {});
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
