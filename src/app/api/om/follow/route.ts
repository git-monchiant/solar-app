import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { OM_FOLLOW_DROP_SQL, OM_FOLLOW_SCOPE_SQL } from "@/lib/om/follow-sql";
import { getSettings } from "@/lib/om/settings";
import { actionLabel, logBooking } from "@/lib/om/booking-log";
import { toThaiOffset } from "@/lib/om/booking";

// แท็บ "ติดตาม" ของงานบริการ — ★ การ์ดคำนวณสด ไม่มีแถวงานรอไว้ล่วงหน้า
//   เกณฑ์: บ้าน O&M ที่มีระบบติดตั้ง + เลยรอบล้าง (om_service_type.cycle_months)
// ★ ผู้ใช้เคาะ 10 ก.ย. 69: ไม่มี "รอบโทร" — ใครเปิดหน้านี้ก็โทรต่อได้
//   (24 ก.ย. เฟส 4 เพิ่ม owner_user_id = เจ้าของเคส แต่เป็นของเสริมไม่ใช่ประตูล็อก
//    ว่างไว้ได้ ใครก็หยิบต่อได้เหมือนเดิม — มีไว้ให้ถามได้ว่า "งานของฉัน" คืออะไร)
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
  // ★ house=<id> = โหมด "บ้านเดียว" ของหน้ารายละเอียด (เฟส 3 แผน 20260922-01)
  //   ข้ามตัวกรองแท็บ/โครงการ/ค้นหาทั้งหมด — เปิดจาก URL ตรง ๆ ต้องได้ของเสมอ
  //   ไม่ทำเป็น endpoint ใหม่เพราะเกณฑ์ #due/#call/#job ต้องตรงกับลิสต์เป๊ะ
  //   (แยกไปเขียนใหม่แล้วจะเพี้ยนคนละที่เวลาแก้ทีหลัง — กติกาเดียวกับ house-scope.ts)
  const houseOnly = Math.max(0, Number(u.get("house")) || 0);
  // ★ mine=1 = ติ๊ก "งานของฉัน" ในหน้างานบริการ (เฟส 4 · ผู้ใช้เคาะ 24 ก.ย. ให้อยู่ในโมดูล O&M)
  //   เป็นตัวกรอง "ซ้อนบน" แท็บ/โครงการ/คำค้น ไม่ใช่ตัวแทน — แบบเดียวกับ Pipeline
  //   และต้องกรองตัวเลขบนแท็บด้วย เพราะเลขบนแท็บต้องเท่ากับจำนวนที่กดเข้าไปเห็นจริง
  const mineOnly = u.get("mine") === "1" ? (gate.userId ?? 0) : 0;
  const page = Math.max(1, Number(u.get("page")) || 1);
  const size = Math.min(100, Math.max(10, Number(u.get("size")) || 30));

  const cfg = await getSettings("call.");
  const maxAttempts = Number(cfg["call.max_attempts"] ?? 3);

  const db = await getOmDb();
  try {
  const r = await db.request()
    .input("house", sql.Int, houseOnly)
    .input("mine", sql.Int, mineOnly)
    .input("g", sql.NVarChar(20), group)
    .input("tab", sql.VarChar(20), tab)
    .input("q", sql.NVarChar(80), q ? `%${q}%` : "")
    .input("max", sql.Int, maxAttempts)
    .input("off", sql.Int, (page - 1) * size)
    .input("size", sql.Int, size)
    .query(`
    ${OM_FOLLOW_SCOPE_SQL}

    SELECT bucket, COUNT(*) n FROM #x
     WHERE (@mine = 0 OR owner_user_id = @mine)
     GROUP BY bucket;

    SELECT COUNT(*) total FROM #x d
     WHERE d.bucket = @tab
       AND (@g = '' OR d.project_id = @g)
       AND (@q = '' OR d.house_number LIKE @q OR d.customer_name LIKE @q OR d.phone LIKE @q)
       AND (@mine = 0 OR d.owner_user_id = @mine);

    SELECT d.* FROM #x d
     WHERE (@house > 0 AND d.house_id = @house)
        OR (@house = 0
            AND d.bucket = @tab
            AND (@g = '' OR d.project_id = @g)
            AND (@q = '' OR d.house_number LIKE @q OR d.customer_name LIKE @q OR d.phone LIKE @q)
            AND (@mine = 0 OR d.owner_user_id = @mine))
     ORDER BY ${sort}
     OFFSET @off ROWS FETCH NEXT @size ROWS ONLY;

    SELECT d.project_id, MAX(d.project_name) project_name, COUNT(*) n
      FROM #x d WHERE d.bucket = 'follow' GROUP BY d.project_id ORDER BY n DESC;

    -- ประวัติของบ้านหลังนี้ (โหมดบ้านเดียว) — รวมทั้งที่ผูกกับบ้านตรง ๆ (การโทรก่อนมีใบงาน)
    -- และที่ผูกกับใบงานของบ้านหลังนี้ทุกใบ ⇒ ไทม์ไลน์เส้นเดียวไม่ขาดตอน
    IF @house > 0
      SELECT TOP 200 bh.id, bh.booking_id, bh.[action],
             JSON_VALUE(bh.to_json, '$.outcome') outcome,
             bh.reason, u2.full_name actor_name,
             CONVERT(varchar(33), bh.created_at, 126) created_at,
             CONVERT(char(10), bh.next_action_date, 23) next_action_date
        FROM om_booking_history bh
        LEFT JOIN users u2 ON u2.id = bh.actor_user_id
       WHERE bh.house_id = @house
          OR bh.booking_id IN (SELECT b3.id FROM om_bookings b3 WHERE b3.house_id = @house)
       ORDER BY bh.id DESC;

    ${OM_FOLLOW_DROP_SQL}`);

  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  const counts: Record<string, number> = {};
  for (const x of rs[0]) counts[String(x.bucket)] = Number(x.n);
  return NextResponse.json({
    counts,
    total: Number(rs[1][0]?.total ?? 0),
    items: fixDates(rs[2]),
    projects: rs[3],
    // rs[4] มีเฉพาะโหมดบ้านเดียว (IF @house > 0) — ต่อท้ายสุดไว้ index 0-3 ของโหมดลิสต์จะได้ไม่ขยับ
    history: houseOnly > 0
      ? fixDates(rs[4] ?? []).map((h) => ({ ...h, action_label: actionLabel(String(h.action)) }))
      : [],
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
