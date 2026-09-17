import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { actionLabel, logBooking, type BookingAction } from "@/lib/om/booking-log";
import { canMove, toThaiOffset } from "@/lib/om/booking";

// งานบริการรายชิ้น — ดูรายละเอียด + ประวัติ · เปลี่ยนสถานะ/วันนัด/ทีม/ลำดับคิว
// ★ ทุกการเปลี่ยนต้องลง om_booking_history ในทรานแซกชันเดียวกัน (booking-log.ts)
// ★ ปิดงานประเภทที่ใช้สิทธิ์ = ตัดสิทธิ์ "ชนิดเดียวกับงาน" 1 ครั้ง · ย้อนออกจาก closed = คืนสิทธิ์
//   (9 ก.ย. 69 สิทธิ์ผูกกับประเภทงานแล้ว — ปิดงานตรวจเช็กจะไม่ไปกินสิทธิ์ล้างแผงอีก)

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const db = await getOmDb();
  const r = await db.request().input("id", sql.Int, id).query(`
    SELECT b.id, b.house_id, b.service_type_id, b.status, b.note, b.queue_index,
           b.rescheduled_count, b.source, b.cancelled_reason, b.team_id,
           CONVERT(varchar(33), b.scheduled_at, 126) scheduled_at,
           CONVERT(varchar(33), b.created_at, 126) created_at,
           st.label_th service_type, CAST(st.consumes_quota AS int) consumes_quota,
           t.name team_name, t.color team_color,
           h.house_number, h.project_id, ISNULL(pj.name_th, h.project_name) project_name,
           h.latitude, h.longitude
    FROM om_bookings b
    JOIN om_houses h ON h.id = b.house_id
    LEFT JOIN om_projects pj ON pj.project_id = h.project_id
    LEFT JOIN om_service_type st ON st.id = b.service_type_id
    LEFT JOIN om_teams t ON t.id = b.team_id
    WHERE b.id = @id;

    SELECT hc.role, c.id customer_id, c.full_name,
           (SELECT TOP 1 p.phone FROM om_customer_phones p WHERE p.customer_id = c.id
            ORDER BY p.is_primary DESC, p.id) phone
    FROM om_house_customers hc JOIN om_customers c ON c.id = hc.customer_id
    WHERE hc.house_id = (SELECT house_id FROM om_bookings WHERE id = @id) AND hc.is_current = 1
    ORDER BY CASE hc.role WHEN 'owner' THEN 0 ELSE 1 END, hc.id;

    SELECT bh.id, bh.[action], bh.actor_role, bh.reason, bh.from_json, bh.to_json,
           CONVERT(varchar(33), bh.created_at, 126) created_at, u.full_name actor_name
    FROM om_booking_history bh LEFT JOIN users u ON u.id = bh.actor_user_id
    WHERE bh.booking_id = @id ORDER BY bh.id DESC;`);
  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  const booking = rs[0][0];
  if (!booking) return NextResponse.json({ error: "ไม่พบงานนี้" }, { status: 404 });
  return NextResponse.json({
    booking: fixDates([booking])[0],
    customers: rs[1],
    history: (rs[2] as Record<string, unknown>[]).map((h) => ({ ...h, action_label: actionLabel(String(h.action)) })),
  });
}

// PATCH { status? , scheduled_at?, team_id?, queue_index?, note?, reason? }
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const b = await req.json().catch(() => ({}));

  const db = await getOmDb();
  const cur = (await db.request().input("id", sql.Int, id).query(`
    SELECT b.id, b.house_id, b.status, b.team_id, b.queue_index, b.rescheduled_count, b.service_type_id,
           CONVERT(varchar(33), b.scheduled_at, 126) scheduled_at,
           CAST(st.consumes_quota AS int) consumes_quota
    FROM om_bookings b LEFT JOIN om_service_type st ON st.id = b.service_type_id
    WHERE b.id = @id`)).recordset[0];
  if (!cur) return NextResponse.json({ error: "ไม่พบงานนี้" }, { status: 404 });

  const set: string[] = [];
  const from: Record<string, unknown> = {};
  const to: Record<string, unknown> = {};
  let action: BookingAction = "reschedule";

  const newStatus = typeof b.status === "string" ? b.status.trim() : "";
  if (newStatus && newStatus !== cur.status) {
    if (!canMove(String(cur.status), newStatus))
      return NextResponse.json({ error: `เปลี่ยนจาก ${cur.status} ไป ${newStatus} ไม่ได้` }, { status: 400 });
    set.push("status = @st");
    from.status = cur.status; to.status = newStatus;
    action = newStatus === "confirmed" ? "confirm" : newStatus === "progress" ? "start"
      : newStatus === "checked" ? "check" : newStatus === "closed" ? "done"
      : newStatus === "cancelled" ? "cancel" : newStatus === "no_show" ? "no_show" : "reschedule";
  }

  const when = b.scheduled_at === null ? null : toThaiOffset(b.scheduled_at);
  const hasWhen = Object.prototype.hasOwnProperty.call(b, "scheduled_at");
  if (hasWhen && when !== cur.scheduled_at) {
    set.push("scheduled_at = @w");
    // นับจำนวนครั้งที่เลื่อน เฉพาะตอนที่มีวันเดิมอยู่แล้ว
    if (cur.scheduled_at && when) set.push("rescheduled_count = rescheduled_count + 1");
    from.scheduled_at = cur.scheduled_at; to.scheduled_at = when;
    if (!newStatus) action = "reschedule";
  }

  if (Object.prototype.hasOwnProperty.call(b, "team_id")) {
    const t = b.team_id === null || b.team_id === "" ? null : Number(b.team_id);
    if (t !== cur.team_id) {
      set.push("team_id = @tm");
      from.team_id = cur.team_id; to.team_id = t;
      if (!newStatus && !hasWhen) action = "assign_team";
    }
  }
  if (Object.prototype.hasOwnProperty.call(b, "queue_index")) {
    const qi = b.queue_index === null ? null : Number(b.queue_index);
    if (qi !== cur.queue_index) {
      set.push("queue_index = @qi");
      from.queue_index = cur.queue_index; to.queue_index = qi;
      if (!newStatus && !hasWhen) action = "reorder";
    }
  }
  if (typeof b.note === "string") { set.push("note = @n"); to.note = b.note.trim() || null; }
  if (newStatus === "cancelled") set.push("cancelled_reason = @rs");

  if (!set.length) return NextResponse.json({ ok: true, unchanged: true });

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const rq = new sql.Request(tx).input("id", sql.Int, id)
      .input("st", sql.NVarChar(20), newStatus || null)
      .input("w", sql.DateTimeOffset, when)
      .input("tm", sql.Int, b.team_id === null || b.team_id === "" ? null : Number(b.team_id))
      .input("qi", sql.Int, b.queue_index === null || b.queue_index === undefined ? null : Number(b.queue_index))
      .input("n", sql.NVarChar(sql.MAX), typeof b.note === "string" ? b.note.trim() || null : null)
      .input("rs", sql.NVarChar(300), typeof b.reason === "string" ? b.reason.trim() || null : null);
    await rq.query(`UPDATE om_bookings SET ${set.join(", ")}, updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);

    // ★ ปิดงานประเภทที่ใช้สิทธิ์ → ตัดสิทธิ์ของ "ชนิดงานนั้น" 1 ครั้ง (ผูกกับ booking ไว้ ย้อนได้)
    if (newStatus === "closed" && cur.consumes_quota === 1) {
      const inst = (await new sql.Request(tx).input("h", sql.Int, cur.house_id)
        .query(`SELECT TOP 1 id FROM om_installations WHERE house_id = @h ORDER BY id`)).recordset[0];
      if (inst) {
        const dup = (await new sql.Request(tx).input("b", sql.Int, id)
          .query(`SELECT TOP 1 id FROM om_redemptions WHERE booking_id = @b AND status <> 'void'`)).recordset[0];
        if (!dup) {
          // ยอดคงเหลือของชนิดนี้ก่อนตัด — งานเกิดขึ้นจริงแล้วจึงต้องตัดเสมอ ถึงจะติดลบ
          // แต่ต้องจดไว้ในโน้ตให้คนตามเก็บเงิน/เติมสิทธิ์เห็น ไม่ใช่ปล่อยเงียบ
          const left = (await new sql.Request(tx)
            .input("h", sql.Int, cur.house_id).input("t", sql.Int, cur.service_type_id)
            .query(`SELECT ISNULL(SUM(balance), 0) balance FROM om_entitlement_balance
                    WHERE house_id = @h AND service_type_id = @t`)).recordset[0]?.balance ?? 0;
          await new sql.Request(tx).input("i", sql.Int, inst.id).input("b", sql.Int, id)
            .input("d", sql.Date, (when ?? cur.scheduled_at ?? new Date().toISOString()).slice(0, 10))
            .input("t", sql.Int, cur.service_type_id)
            .input("n", sql.NVarChar(300), left > 0
              ? "ตัดสิทธิ์อัตโนมัติเมื่อปิดงาน"
              : "ตัดสิทธิ์อัตโนมัติเมื่อปิดงาน · ★ ไม่มีสิทธิ์คงเหลือ ยอดติดลบ")
            .input("u", sql.Int, gate.userId ?? null)
            .query(`INSERT INTO om_redemptions (installation_id, booking_id, service_date, status, note, created_by, service_type_id)
                    VALUES (@i, @b, @d, 'used', @n, @u, @t)`);
        }
      }
    }
    // ย้อนออกจาก closed → คืนสิทธิ์ (ยกเลิกใบตัดสิทธิ์ที่ผูกกับงานนี้)
    if (cur.status === "closed" && newStatus && newStatus !== "closed")
      await new sql.Request(tx).input("b", sql.Int, id)
        .query(`UPDATE om_redemptions SET status = 'void', note = ISNULL(note, N'') + N' · ยกเลิกเพราะย้อนสถานะงาน'
                WHERE booking_id = @b AND status <> 'void'`);

    await logBooking(tx, { bookingId: id, action, actorUserId: gate.userId ?? null,
      from, to, reason: typeof b.reason === "string" ? b.reason.trim() || null : null });
    await tx.commit();
    return NextResponse.json({ ok: true, id, status: newStatus || cur.status });
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
