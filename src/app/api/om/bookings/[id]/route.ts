import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole, requireAuth } from "@/lib/auth";
import { OM_WORK_ROLES } from "@/lib/om/om-roles";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { actionLabel, logBooking, type BookingAction } from "@/lib/om/booking-log";
import { canMove, statusLabel, toThaiOffset } from "@/lib/om/booking";
import { omSlotsFor, shiftSlots, teamClash, thaiLocal } from "@/lib/om/time-slot";
import { serializeSlots } from "@/lib/time-slots";
import { notifyOmUser, resolveOmNotifications } from "@/lib/om/notifications";
import { getSettings } from "@/lib/om/settings";
import { OM_BOOKING_PAID_SQL } from "@/lib/om/om-quotation";

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
  const gate = await requireAnyRole(req, OM_WORK_ROLES);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const b = await req.json().catch(() => ({}));

  const db = await getOmDb();
  const cur = (await db.request().input("id", sql.Int, id).query(`
    SELECT b.id, b.house_id, b.status, b.team_id, b.owner_user_id, b.queue_index, b.rescheduled_count, b.service_type_id,
           CONVERT(varchar(33), b.scheduled_at, 126) scheduled_at, b.time_slot,
           CAST(st.consumes_quota AS int) consumes_quota,
           h.house_number, st.label_th service_type
    FROM om_bookings b
    JOIN om_houses h ON h.id = b.house_id
    LEFT JOIN om_service_type st ON st.id = b.service_type_id
    WHERE b.id = @id`)).recordset[0];
  if (!cur) return NextResponse.json({ error: "ไม่พบงานนี้" }, { status: 404 });

  const set: string[] = [];
  const from: Record<string, unknown> = {};
  const to: Record<string, unknown> = {};
  let action: BookingAction = "reschedule";

  const newStatus = typeof b.status === "string" ? b.status.trim() : "";

  // ★ 29 ก.ย. 69 (แผน 20260929-01) กันแก้ใบงานผิดลำดับ — หน้าจอซ่อนปุ่มแล้วก็ต้องกันที่นี่ด้วย
  // 1) ใบที่จบแล้วแก้ทีม/คิว/วันนัดไม่ได้ (เจอ 28 ก.ย.: ใบ #99 ถูกจ่ายทีมหลังปิดงาน)
  //    ยกเว้นคำขอที่เปิดใบกลับมาตามลำดับสถานะ (ยกเลิก/ไม่อยู่บ้าน → ติดตาม/รอยืนยันนัด)
  const FINISHED = ["closed", "cancelled", "no_show"];
  const has = (k: string) => Object.prototype.hasOwnProperty.call(b, k);
  const reopening = !!newStatus && !FINISHED.includes(newStatus);
  if (FINISHED.includes(String(cur.status)) && !reopening && ["team_id", "queue_index", "scheduled_at", "time_slot"].some(has))
    return NextResponse.json({ error: `ใบงาน #${id} ${statusLabel(String(cur.status))}แล้ว — แก้ทีม คิว หรือวันนัดไม่ได้` }, { status: 400 });
  // 2) (เลิกแล้ว 1 ต.ค. 69) เดิมเริ่มงานต้องจ่ายทีมก่อน — ผู้ใช้เคาะเลิกใช้ทีม A/B/C
  //    ทีมสำรวจกับทีมล้างเป็นชุดเดียวกัน ไม่มีขั้นจ่ายทีมแล้ว (แผน 20261001-01 เฟส 4)
  //    ถ้ายังกันไว้ ใบงานใหม่ (ไม่มีทีม) จะกด "ช่างถึงหน้างานแล้ว" และปิดงานจากใบตรวจไม่ได้
  // 3) ปิดงานต้องมีใบตรวจรับงานแล้ว — ทางปิดงานทางเดียวคือปุ่มท้ายใบตรวจ (บันทึกใบก่อนแล้วค่อยเปลี่ยนสถานะ)
  if (newStatus === "closed" && newStatus !== cur.status) {
    const rep = (await db.request().input("id", sql.Int, id)
      .query(`SELECT TOP 1 id FROM om_job_report WHERE booking_id = @id`)).recordset[0];
    if (!rep)
      return NextResponse.json({ error: "ยังไม่มีใบตรวจรับงาน — กรอกใบตรวจแล้วกดปิดงานท้ายใบ" }, { status: 400 });
  }

  if (newStatus && newStatus !== cur.status) {
    if (!canMove(String(cur.status), newStatus))
      return NextResponse.json({ error: `เปลี่ยนจาก ${cur.status} ไป ${newStatus} ไม่ได้` }, { status: 400 });
    // ★ แผน 20261014-03: ขั้นชำระเงิน → นัดหมาย ต้องรับเงินแล้ว (กติกาเดียวกับ /api/om/follow "เก็บค่าบริการก่อนนัด")
    //   เดิม PATCH ตรวจแค่ลำดับสถานะ ใครล็อกอินก็ย้ายใบที่ยังไม่จ่ายไปนัดแล้วได้
    if (cur.status === "payment" && ["pending", "confirmed"].includes(newStatus)) {
      const paid = (await db.request().input("id", sql.Int, id)
        .query(`SELECT CASE WHEN ${OM_BOOKING_PAID_SQL("bk")} THEN 1 ELSE 0 END paid FROM om_bookings bk WHERE bk.id = @id`))
        .recordset[0]?.paid;
      if (!paid)
        return NextResponse.json({ error: "ยังไม่ได้รับเงินค่าบริการ — นัดได้หลัง Account ยืนยันรับเงินแล้ว" }, { status: 409 });
    }
    set.push("status = @st");
    from.status = cur.status; to.status = newStatus;
    action = newStatus === "confirmed" ? "confirm" : newStatus === "progress" ? "start"
      : newStatus === "checked" ? "check" : newStatus === "closed" ? "done"
      : newStatus === "cancelled" ? "cancel" : newStatus === "no_show" ? "no_show" : "reschedule";
  }

  // ★ แผน 20261001-01 เฟส 1: ช่วงเวลาที่จอง (time_slot) แบบนัดสำรวจ
  //   ส่ง time_slot มา = ใช้ช่องนั้น (วันจาก scheduled_at ที่ส่งมา ไม่งั้นวันเดิม) · เวลาเริ่ม = ช่องแรก
  //   ลากในปฏิทินส่งแค่ scheduled_at = เลื่อนช่องเดิมตามเวลาเริ่มใหม่ (จำนวนช่องคงเดิม) · ล้างวันนัด = ล้างช่องด้วย
  let when = b.scheduled_at === null ? null : toThaiOffset(b.scheduled_at);
  let slot: string | null = cur.time_slot ?? null;
  if (has("time_slot") && b.scheduled_at !== null) {
    const r = await omSlotsFor(db, has("scheduled_at") ? b.scheduled_at : cur.scheduled_at, b.time_slot);
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
    when = toThaiOffset(r.at);
    slot = r.slot;
  } else if (has("scheduled_at")) {
    slot = when ? serializeSlots(await shiftSlots(db, cur.time_slot ?? null, thaiLocal(when).slice(11, 16))) : null;
  }
  const hasWhen = has("scheduled_at") || has("time_slot");
  if (hasWhen && (when !== cur.scheduled_at || slot !== (cur.time_slot ?? null))) {
    // ★ 21 ต.ค. 69 นัดทับเวลาไม่ได้ (แผน 20261021-02 รอบ 3) — รวมการลากในปฏิทิน · ใบตัวเองไม่นับ
    if (when && slot) {
      const clash = await teamClash(db, when, slot, id);
      if (clash) return NextResponse.json({ error: clash }, { status: 409 });
    }
    set.push("scheduled_at = @w", "time_slot = @ts");
    // นับจำนวนครั้งที่เลื่อน เฉพาะตอนที่มีวันเดิมอยู่แล้ว
    if (cur.scheduled_at && when) set.push("rescheduled_count = rescheduled_count + 1");
    from.scheduled_at = cur.scheduled_at; to.scheduled_at = when;
    from.time_slot = cur.time_slot ?? null; to.time_slot = slot;
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
  // เจ้าของเคส (เฟส 4) — คนละอย่างกับ team_id ที่เป็นทีมช่างไปหน้างาน
  // NULL = ปล่อยว่าง ใครก็หยิบต่อได้ ตามที่ผู้ใช้เคาะ 10 ก.ย.
  if (Object.prototype.hasOwnProperty.call(b, "owner_user_id")) {
    const o = b.owner_user_id === null || b.owner_user_id === "" ? null : Number(b.owner_user_id);
    if (o !== cur.owner_user_id) {
      set.push("owner_user_id = @ow", "owner_assigned_at = CASE WHEN @ow IS NULL THEN NULL ELSE SYSDATETIMEOFFSET() END");
      from.owner_user_id = cur.owner_user_id; to.owner_user_id = o;
      if (!newStatus && !hasWhen) action = "assign_owner";
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
      .input("ts", sql.NVarChar(200), slot)
      .input("tm", sql.Int, b.team_id === null || b.team_id === "" ? null : Number(b.team_id))
      .input("ow", sql.Int, b.owner_user_id === null || b.owner_user_id === "" || b.owner_user_id === undefined ? null : Number(b.owner_user_id))
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
          const bal = (await new sql.Request(tx)
            .input("h", sql.Int, cur.house_id).input("t", sql.Int, cur.service_type_id)
            .query(`SELECT ISNULL(SUM(balance), 0) balance, ISNULL(SUM(total_used), 0) used FROM om_entitlement_balance
                    WHERE house_id = @h AND service_type_id = @t`)).recordset[0];
          const left: number = bal?.balance ?? 0;
          // วันที่ล้าง = วันนัด แต่ไม่เกินวันนี้ (เวลาไทย)
          //   ★ 14 ต.ค. 69 ปิดงานก่อนถึงวันนัดได้ เดิมลงวันนัดตรง ๆ → วันล้างอยู่ในอนาคต
          //     กราฟภาพรวมโผล่เดือนที่ยังไม่ถึง และ "ล้างล่าสุด" ของบ้านเลยวันนี้ไป
          //     (เดิม fallback เป็น toISOString() ซึ่งเป็นเวลา UTC — ก่อน 7 โมงเช้าได้วันของเมื่อวาน)
          const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
          const appt = (when ?? cur.scheduled_at)?.slice(0, 10);
          await new sql.Request(tx).input("i", sql.Int, inst.id).input("b", sql.Int, id)
            .input("d", sql.Date, appt && appt < today ? appt : today)
            .input("t", sql.Int, cur.service_type_id)
            .input("n", sql.NVarChar(300), left > 0
              ? "ตัดสิทธิ์อัตโนมัติเมื่อปิดงาน"
              : "ตัดสิทธิ์อัตโนมัติเมื่อปิดงาน · ★ ไม่มีสิทธิ์คงเหลือ ยอดติดลบ")
            .input("u", sql.Int, gate.userId ?? null)
            // ★ แผน 20261015-04: จด "ครั้งที่ / คงเหลือหลังตัด" ไว้กับแถวนี้ ให้ใบบริการ PDF อ่าน
            //   ใบสร้างใหม่ทุกครั้งที่เปิด — คิดยอดตอนเปิดใบ เลขในใบเก่าจะเปลี่ยนตามการล้าง/ซื้อเพิ่มครั้งหลัง ๆ
            .input("sq", sql.Int, (bal?.used ?? 0) + 1)
            .input("ba", sql.Int, left - 1)
            .query(`INSERT INTO om_redemptions (installation_id, booking_id, service_date, status, note, created_by, service_type_id,
                                                seq_no, balance_after)
                    VALUES (@i, @b, @d, 'used', @n, @u, @t, @sq, @ba)`);
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

    // ── แจ้งเตือน (เฟส 6) — อยู่ใน transaction เดียวกับการแก้ใบงาน
    //    rollback แล้วต้องไม่มีใครได้กระดิ่งเรื่องที่ไม่เคยเกิดขึ้น
    const ownerChanged = Object.prototype.hasOwnProperty.call(to, "owner_user_id");
    const newOwner = ownerChanged ? (to.owner_user_id as number | null) : null;
    const jobDone = newStatus === "closed" || newStatus === "cancelled" || newStatus === "no_show";

    if (ownerChanged || jobDone) {
      // ปิดของเก่าก่อนเสมอ: เปลี่ยนมือแล้วคนเดิมไม่ต้องถือเรื่องนี้ไว้ · งานจบแล้วก็ไม่ต้องเตือนใคร
      await resolveOmNotifications(tx, { bookingId: id, exceptUserId: jobDone ? null : newOwner });
    }
    if (ownerChanged && newOwner) {
      const cfg = await getSettings("notify.");
      if (cfg["notify.assign_owner"] !== false) {
        await notifyOmUser(tx, {
          recipientUserId: newOwner,
          type: "om_owner_assigned",
          eventKey: `om_owner_assigned:${id}`,
          title: "มีงาน O&M ถูกมอบหมายให้คุณ",
          message: `บ้าน ${cur.house_number ?? "-"} · ${cur.service_type ?? "งานบริการ"}`,
          houseId: cur.house_id,
          bookingId: id,
          createdBy: gate.userId ?? null,
        });
      }
    }

    await tx.commit();
    return NextResponse.json({ ok: true, id, status: newStatus || cur.status });
  } catch (e) {
    await tx.rollback();
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
