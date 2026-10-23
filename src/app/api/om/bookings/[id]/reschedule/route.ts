import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole, requireAuth } from "@/lib/auth";
import { OM_WORK_ROLES } from "@/lib/om/om-roles";
import { sql } from "@/lib/db";
import { getOmDb, pushLineMessage, OM_LINE } from "@/lib/om/line";
import { getSettings } from "@/lib/om/settings";
import { logBooking } from "@/lib/om/booking-log";
import { resolveOmNotifications } from "@/lib/om/notifications";
import { toThaiOffset } from "@/lib/om/booking";
import { omSlotsFor, teamClash } from "@/lib/om/time-slot";
import { formatSlotsRange } from "@/lib/time-slots";
import { omErrorText } from "@/lib/om/api-error";

// เลื่อนนัดจากปุ่ม Reschedule ในหน้ารายละเอียด (แผน 20260928-04 · ผู้ใช้เคาะ "ทำตามแนะนำ" ข้อ 4 ข)
// ★ ใช้กติกาในหน้าตั้งค่า O&M (กลุ่ม "การเลื่อนนัด") กับการเลื่อนโดยทีมงาน:
//   · ผลที่ตามมา — แจ้งลูกค้าทาง LINE (notify_line)
//     (กลับเป็นรอยืนยัน reset_to_pending เลิกแล้ว 1 ต.ค. 69 — ทีมตกลงวันใหม่กับลูกค้าตอนเลื่อน ใบงานยังเป็นนัดแล้ว)
//     (ปลดทีม unassign_team เลิกแล้ว 1 ต.ค. 69 — เลิกใช้ทีม A/B/C)
//   · เพดาน (max_times · min_hours_before) ไม่บล็อกทีมงาน แค่เตือน — เพดานมีไว้คุมลูกค้าที่เลื่อนเอง
// ★ การลากในปฏิทิน / จ่ายงาน ยังใช้ PATCH /api/om/bookings/[id] เหมือนเดิม (เครื่องมือจัดคิวของคนจ่ายงาน)
//   ถ้าใส่กติกาที่นั่นด้วย ลากย้ายช่องเวลาครั้งไหนทีมก็หลุดทุกครั้ง

// ★ 23 ต.ค. 69 (แผน 20261023-01 รอบ 8) ผู้ใช้สั่ง "เปิด lock ให้ reschedule ได้ทั้งหมด" — ใบที่ยังไม่ปิดเลื่อนได้หมด
//   รวมใบที่ช่างเริ่มกรอกใบตรวจแล้ว (progress / checked ใบเก่า) · สถานะคงเดิม เปลี่ยนแค่วันเวลา (reset_to_pending ปิดอยู่)
//   เดิมเฉพาะ pending / confirmed (หลังช่างเข้างานแล้วไม่ให้เลื่อน)
const OPEN = ["pending", "confirmed", "progress", "checked"];

type Cur = {
  id: number; house_id: number; status: string; team_id: number | null; team_name: string | null;
  queue_index: number | null; rescheduled_count: number; scheduled_at: string | null; time_slot: string | null;
  house_number: string | null; service_type: string | null; line_links: number;
};

async function load(db: sql.ConnectionPool, id: number): Promise<Cur | undefined> {
  return (await db.request().input("id", sql.Int, id).query(`
    SELECT b.id, b.house_id, b.status, b.team_id, t.name team_name, b.queue_index,
           ISNULL(b.rescheduled_count, 0) rescheduled_count,
           CONVERT(varchar(33), b.scheduled_at, 126) scheduled_at, b.time_slot,
           h.house_number, st.label_th service_type,
           (SELECT COUNT(*) FROM om_line_user_houses l WHERE l.house_id = b.house_id) line_links
      FROM om_bookings b
      JOIN om_houses h ON h.id = b.house_id
      LEFT JOIN om_teams t ON t.id = b.team_id
      LEFT JOIN om_service_type st ON st.id = b.service_type_id
     WHERE b.id = @id`)).recordset[0];
}

/** กติกาจาก om_settings — ไม่ hardcode (กติกาโปรเจกต์ 31 ส.ค.) · ค่าที่ยังไม่ตั้งใช้ค่าผ่อนปรนใน settings.ts */
async function rules() {
  const c = await getSettings("reschedule.");
  return {
    max_times: Number(c["reschedule.max_times"]) > 0 ? Number(c["reschedule.max_times"]) : null,   // null = ไม่จำกัด
    min_hours_before: Number(c["reschedule.min_hours_before"]) > 0 ? Number(c["reschedule.min_hours_before"]) : 0,
    // เลิกแล้ว 1 ต.ค. 69 (ผู้ใช้สั่ง: เลื่อนนัดแล้วหน้าตาเหมือนนัดปกติ ไม่มีปุ่มลูกค้ายืนยัน) — ค่าในหน้าตั้งค่าซ่อนไว้ ไม่อ่าน
    reset_to_pending: false,
    // เลิกใช้ทีม A/B/C (แผน 20261001-01 เฟส 4) — ไม่มีทีมให้ปลดแล้ว · ค่าในหน้าตั้งค่าซ่อนไว้ ไม่อ่าน
    unassign_team: false,
    notify_line: c["reschedule.notify_line"] === true,
  };
}
type Rules = Awaited<ReturnType<typeof rules>>;

/** เกินเพดานในตั้งค่า — เตือน ไม่บล็อก (ทีมงานเลื่อนให้ลูกค้าที่โทรมาขอได้เสมอ) */
function warningsOf(cur: Cur, r: Rules, now = Date.now()): string[] {
  const w: string[] = [];
  const nth = cur.rescheduled_count + 1;
  if (r.max_times && nth > r.max_times) w.push(`เลื่อนครั้งที่ ${nth} — เกินที่ตั้งไว้ ${r.max_times} ครั้งต่อนัด`);
  if (r.min_hours_before && cur.scheduled_at) {
    const hrs = (new Date(cur.scheduled_at).getTime() - now) / 3_600_000;
    if (hrs < 0) w.push("เลยเวลานัดเดิมมาแล้ว");
    else if (hrs < r.min_hours_before) w.push(`เหลือไม่ถึง ${r.min_hours_before} ชั่วโมงก่อนนัดเดิม`);
  }
  return w;
}

// GET — บอกล่วงหน้าว่ากดยืนยันแล้วจะเกิดอะไร (ฟอร์มเลื่อนนัดโชว์ก่อนให้กด)
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const db = await getOmDb();
  const cur = await load(db, id);
  if (!cur) return NextResponse.json({ error: "ไม่พบใบงานนี้" }, { status: 404 });
  const r = await rules();
  return NextResponse.json({
    status: cur.status, team_name: cur.team_name, rescheduled_count: cur.rescheduled_count,
    line_links: cur.line_links, line_enabled: OM_LINE.enabled,
    rules: r, warnings: warningsOf(cur, r),
    will: {
      to_pending: r.reset_to_pending && cur.status === "confirmed",
      clear_team: r.unassign_team && cur.team_id != null,
      notify_line: r.notify_line && cur.line_links > 0,
    },
  });
}

// POST { scheduled_at: "YYYY-MM-DDTHH:mm" | "YYYY-MM-DD", time_slot?, reason? }
//   time_slot = ช่อง 30 นาทีที่จอง (แผน 20261001-01) — ส่งมาแล้ว scheduled_at ใช้แค่วัน เวลาเริ่ม = ช่องแรก
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyRole(req, OM_WORK_ROLES);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const b = await req.json().catch(() => ({}));

  const db = await getOmDb();
  const cur = await load(db, id);
  if (!cur) return NextResponse.json({ error: "ไม่พบใบงานนี้" }, { status: 404 });
  if (!OPEN.includes(cur.status))
    return NextResponse.json({ error: "เลื่อนนัดได้เฉพาะใบงานที่มีวันนัดและยังไม่ปิดงาน" }, { status: 400 });

  const picked = await omSlotsFor(db, b.scheduled_at, b.time_slot);
  if ("error" in picked) return NextResponse.json({ error: picked.error }, { status: 400 });
  const when = toThaiOffset(picked.at);
  if (!when || Number.isNaN(new Date(when).getTime()))
    return NextResponse.json({ error: "กรุณาระบุวันเวลานัดใหม่" }, { status: 400 });
  if (new Date(when).getTime() < Date.now())
    return NextResponse.json({ error: "วันเวลานัดใหม่ต้องเป็นเวลาข้างหน้า" }, { status: 400 });
  // เวลาเริ่มเดิม แต่จองช่องเพิ่ม/ลด = เลื่อนได้ (เช่น ขยายจาก 1 ชม. เป็น 2 ชม.)
  if (cur.scheduled_at && new Date(when).getTime() === new Date(cur.scheduled_at).getTime()
      && (picked.slot ?? "") === (cur.time_slot ?? ""))
    return NextResponse.json({ error: "วันเวลาที่เลือกตรงกับนัดเดิม กรุณาเลือกวันเวลาใหม่" }, { status: 400 });
  // ★ 21 ต.ค. 69 นัดทับเวลาไม่ได้ (แผน 20261021-02 รอบ 3) — ใบตัวเองไม่นับ
  const clash = await teamClash(db, when, picked.slot, id);
  if (clash) return NextResponse.json({ error: clash }, { status: 409 });

  const r = await rules();
  const warnings = warningsOf(cur, r);
  const toPending = r.reset_to_pending && cur.status === "confirmed";
  const clearTeam = r.unassign_team && cur.team_id != null;
  const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 300) || null : null;

  const set = ["scheduled_at = @w", "time_slot = @ts"];
  const from: Record<string, unknown> = { scheduled_at: cur.scheduled_at, time_slot: cur.time_slot };
  const to: Record<string, unknown> = { scheduled_at: when, time_slot: picked.slot };
  // นับครั้งที่เลื่อน เฉพาะตอนที่มีวันเดิมอยู่แล้ว (กติกาเดียวกับ PATCH)
  if (cur.scheduled_at) set.push("rescheduled_count = rescheduled_count + 1");
  if (toPending) { set.push("status = 'pending'"); from.status = cur.status; to.status = "pending"; }
  if (clearTeam) {
    set.push("team_id = NULL", "queue_index = NULL");
    from.team_id = cur.team_id; to.team_id = null;
  }
  if (warnings.length) to.warnings = warnings;   // เกินเพดาน — จดไว้ในประวัติให้ย้อนดูได้ว่าทีมงานเลื่อนเกิน

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    await new sql.Request(tx).input("id", sql.Int, id).input("w", sql.DateTimeOffset, when)
      .input("ts", sql.NVarChar(200), picked.slot)
      .query(`UPDATE om_bookings SET ${set.join(", ")}, updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);
    await logBooking(tx, { bookingId: id, action: "reschedule", actorUserId: gate.userId ?? null, from, to, reason });
    // เตือน "ใกล้ถึงวันนัด" ของวันเดิมหมดความหมายแล้ว — ตัวตั้งเวลาจะเตือนวันใหม่ให้เอง (event_key มีวันนัดอยู่)
    await resolveOmNotifications(tx, { bookingId: id, types: ["om_job_reminder"] });
    await tx.commit();
  } catch (e) {
    await tx.rollback().catch(() => {});
    return NextResponse.json({ error: omErrorText(e, "เลื่อนนัดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "POST /api/om/bookings/[id]/reschedule") }, { status: 500 });
  }

  // ── แจ้งลูกค้าทาง LINE — หลัง commit เท่านั้น · ส่งไม่ได้ไม่ทำให้การเลื่อนนัดล้ม ──
  // ส่งทุกบัญชี LINE ที่ผูกบ้านนี้ · เก็บลงประวัติแชตเสมอ (แบบ /api/om/line/messages) แอดมินเห็นในหน้าแชต LINE
  let sent = 0;
  const lineUsers: string[] = r.notify_line && cur.line_links > 0
    ? (await db.request().input("h", sql.Int, cur.house_id)
        .query(`SELECT line_user_id FROM om_line_user_houses WHERE house_id = @h`)).recordset.map((x) => String(x.line_user_id))
    : [];
  if (lineUsers.length) {
    const d = new Date(when);
    const day = d.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const time = d.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" });
    const text = [
      // ★ 21 ต.ค. 69 แผน 20261021-01 (ผู้ใช้เลือกแบบ ก): บอกลูกค้าว่าไม่สะดวกตอบกลับทางไหน · ลงท้าย "ค่ะ"
      `แจ้งเปลี่ยนวันนัด${cur.service_type ? `${cur.service_type}` : "งานบริการ"} บ้านเลขที่ ${cur.house_number ?? "-"}`,
      `นัดใหม่: ${day} เวลา ${formatSlotsRange(picked.slot) || time} น.`,   // ช่วงที่จอง (แผน 20261001-01)
      toPending ? "เจ้าหน้าที่จะติดต่อยืนยันนัดอีกครั้งค่ะ" : "หากไม่สะดวก ตอบกลับในแชตนี้ได้ค่ะ",
    ].filter(Boolean).join("\n");
    for (const u of lineUsers) {
      const push = await pushLineMessage(u, [{ type: "text", text }]).catch(() => ({ ok: false, status: 0 }));
      if (push.ok) sent++;
      // กติกาเดียวกับหน้าแชต (/api/om/line/messages): LINE เปิดอยู่แต่ส่งไม่ออก = ไม่จดว่าส่งแล้ว
      //   (ไม่งั้นแอดมินเห็นในแชตว่าแจ้งแล้วทั้งที่ลูกค้าไม่ได้รับ) · LINE ปิด (ช่วงทดสอบ) จดไว้ดูได้
      if (OM_LINE.enabled && !push.ok) continue;
      await db.request()
        .input("u", sql.NVarChar(64), u).input("t", sql.NVarChar(sql.MAX), text)
        .input("p", sql.NVarChar(sql.MAX), JSON.stringify({ auto: "reschedule", booking_id: id, pushed: push.ok }))
        .input("a", sql.Int, gate.userId ?? null)
        .query(`INSERT INTO om_line_messages (line_user_id, direction, message_type, text, payload, admin_user_id, is_read)
                VALUES (@u, 'out', 'text', @t, @p, @a, 1)`)
        .catch(() => {});   // เก็บประวัติไม่ได้ไม่ใช่เหตุให้ตอบว่าเลื่อนนัดไม่สำเร็จ
    }
  }

  return NextResponse.json({
    ok: true,
    status: toPending ? "pending" : cur.status,
    team_cleared: clearTeam,
    warnings,
    line: { enabled: OM_LINE.enabled, linked: lineUsers.length, sent },
  });
}
