import { NextRequest, NextResponse } from "next/server";
import { expireOmGrantsIfDue } from "@/lib/om/entitlement-expiry";
import { requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { OM_FOLLOW_DROP_SQL, OM_FOLLOW_SCOPE_SQL } from "@/lib/om/follow-sql";
import { getSettings } from "@/lib/om/settings";
import { historyLabel, logBooking } from "@/lib/om/booking-log";
import { ACTIVE_STATUS, canMove, statusLabel, toThaiOffset } from "@/lib/om/booking";
import { OM_BOOKING_PAID_SQL } from "@/lib/om/om-quotation";
import { omSlotsFor } from "@/lib/om/time-slot";

// แท็บ "ติดตาม" ของงานบริการ — ★ การ์ดคำนวณสด ไม่มีแถวงานรอไว้ล่วงหน้า
//   เกณฑ์: บ้าน O&M ที่มีระบบติดตั้ง + เลยรอบล้าง (om_service_type.cycle_months)
// ★ ผู้ใช้เคาะ 10 ก.ย. 69: ไม่มี "รอบโทร" — ใครเปิดหน้านี้ก็โทรต่อได้
//   (24 ก.ย. เฟส 4 เพิ่ม owner_user_id = เจ้าของเคส แต่เป็นของเสริมไม่ใช่ประตูล็อก
//    ว่างไว้ได้ ใครก็หยิบต่อได้เหมือนเดิม — มีไว้ให้ถามได้ว่า "งานของฉัน" คืออะไร)
//   ประวัติการโทรอยู่ที่ om_booking_history (booking_id ว่างได้ ผูกกับ house_id แทน)
//   ⇒ ไม่มีตาราง om_call_log แยก

// informed / busy / other = ปุ่ม Follow-up แบบหน้า lead (1 ต.ค. 69) — จดประวัติอย่างเดียว ไม่สร้างใบงาน ไม่ย้ายแท็บ
//   (แท็บคัดจาก declined / wrong_number / จำนวน no_answer เท่านั้น — follow-sql.ts)
const OUTCOME = ["agreed", "postponed", "no_answer", "declined", "wrong_number", "informed", "busy", "other"] as const;
// ช่องทางติดต่อ — ชุดเดียวกับ FOLLOW_UP_METHODS หน้า lead · ไม่ส่ง = โทร (ฟอร์มโทรในการ์ด)
const CHANNEL = ["call", "visit", "line", "other"] as const;
type Outcome = (typeof OUTCOME)[number];

// sort = เรียงตามอะไร · dir = asc/desc (หน้าจอเป็น 2 ช่องแบบ Pipeline — SORTS ใน service-view.ts)
const SORT: Record<string, (dir: "ASC" | "DESC") => string> = {
  wash:  (dir) => `d.last_wash ${dir}, d.house_number`,  // ASC = ค้างนานสุดก่อน (ไม่เคยล้าง = NULL ขึ้นก่อน)
  quota: (dir) => `d.balance ${dir}, d.last_wash ASC`,
};

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const u = req.nextUrl.searchParams;
  const tab = (u.get("tab") ?? "follow").trim();
  const group = (u.get("group") ?? "").trim();
  const q = (u.get("q") ?? "").trim();
  const sort = (SORT[u.get("sort") ?? "wash"] ?? SORT.wash)(u.get("dir") === "desc" ? "DESC" : "ASC");
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

  // ★ cfg ส่งต่อเป็น rules ให้ตัวเลือกวันนัดด้วย — เดิมอ่านแค่ call.* ⇒ booking.advance_* ที่แก้ในหน้าตั้งค่า
  //   ไม่ถึงหน้าจอ ได้ค่า fallback (60 วัน / 24 ชม.) ตลอด (เจอตอนสำรวจแผน 20261001-01)
  //   getSettings ใส่ fallback ทุกกลุ่มมาให้ ⇒ ต้องเอาค่าจริงของ booking.* ทับทีหลัง
  const [callCfg, bookingCfg] = await Promise.all([getSettings("call."), getSettings("booking.")]);
  const cfg = { ...callCfg, ...bookingCfg };
  const maxAttempts = Number(cfg["call.max_attempts"] ?? 3);

  const db = await getOmDb();
  await expireOmGrantsIfDue(db);   // สิทธิ์ที่หมดอายุตัดวันละครั้ง ก่อนอ่านยอด (แผน 20260924-02 เฟส 4)
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
    -- ★ 28 ก.ย. 69 (แผน 20260928-05): เพิ่ม from_json/to_json ให้แท็บ Timeline อ่านรายละเอียด
    --   (วันนัดเดิม→ใหม่ · เลขใบเสนอราคา/ยอด · ยอดเงิน · ทีม) — Activity Log ไม่ได้ใช้ ไม่กระทบ
    IF @house > 0
      SELECT TOP 200 bh.id, bh.booking_id, bh.[action],
             JSON_VALUE(bh.to_json, '$.outcome') outcome,
             bh.reason, u2.full_name actor_name,
             CONVERT(varchar(33), bh.created_at, 126) created_at,
             CONVERT(char(10), bh.next_action_date, 23) next_action_date,
             bh.from_json, bh.to_json
        FROM om_booking_history bh
        LEFT JOIN users u2 ON u2.id = bh.actor_user_id
       WHERE bh.house_id = @house
          OR bh.booking_id IN (SELECT b3.id FROM om_bookings b3 WHERE b3.house_id = @house)
       ORDER BY bh.id DESC;

    -- ใบงานทุกใบของบ้าน (โหมดบ้านเดียว) — หัวกลุ่มของแท็บ Timeline (แผน 20260928-05)
    IF @house > 0
      SELECT b.id, b.status, st.label_th service_type, CAST(st.consumes_quota AS int) consumes_quota,
             CONVERT(varchar(33), b.scheduled_at, 126) scheduled_at, b.time_slot,
             CONVERT(varchar(33), b.created_at, 126) created_at,
             b.parent_booking_id, CAST(b.in_warranty AS int) in_warranty, b.cancelled_reason,
             ISNULL(b.rescheduled_count, 0) rescheduled_count, t.name team_name,
             r.job_no, r.result, CONVERT(varchar(33), r.finished_at, 126) finished_at,
             (SELECT COUNT(*) FROM om_redemptions rd WHERE rd.booking_id = b.id AND rd.status <> 'void') redeemed
        FROM om_bookings b
        LEFT JOIN om_service_type st ON st.id = b.service_type_id
        LEFT JOIN om_teams t ON t.id = b.team_id
        LEFT JOIN om_job_report r ON r.booking_id = b.id
       WHERE b.house_id = @house
       ORDER BY b.id DESC;

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
      ? fixDates(rs[4] ?? []).map((h) => ({ ...h, action_label: historyLabel(String(h.action), h.to_json as string | null) }))
      : [],
    // rs[5] โหมดบ้านเดียว — ใบงานทุกใบของบ้าน (แท็บ Timeline)
    bookings: houseOnly > 0 ? fixDates(rs[5] ?? []) : [],
    rules: cfg,
    page, size,
  });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "อ่านรายการติดตามไม่สำเร็จ" }, { status: 500 });
  }
}

// POST — บันทึกผลการโทร 1 ครั้ง
// { house_id, outcome, note?, next_date?, scheduled_at?, time_slot?, service_type_id? }
//   time_slot = ช่อง 30 นาทีที่จอง (array / JSON) — ส่งมาแล้ว scheduled_at ใช้แค่วัน (แผน 20261001-01)
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

  const channel = (CHANNEL as readonly string[]).includes(String(b.channel)) ? String(b.channel) : "call";
  // วันที่ติดตามจริง (ปุ่ม Follow-up เลือกย้อนหลังได้ 15 วันแบบหน้า lead) — จดใน to_json · created_at ยังเป็นเวลาบันทึก
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const contactDate = typeof b.contact_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.contact_date)
    && b.contact_date <= today && b.contact_date >= new Date(Date.now() + 7 * 3600000 - 15 * 86400000).toISOString().slice(0, 10)
    ? b.contact_date : null;

  // วันนัดโทรครั้งหน้า — ลูกค้าระบุเองมาก่อน ไม่งั้นใช้กติกาในตั้งค่า
  const auto = outcome === "no_answer" ? retryDays : outcome === "postponed" ? postponeDays : null;
  const next = b.next_date
    ? String(b.next_date).slice(0, 10)
    : auto !== null
      ? new Date(Date.now() + auto * 86400000).toISOString().slice(0, 10)
      : null;

  // วันเวลานัดที่ server คิดแล้ว — จดลงประวัติการโทรด้วย (เดิมจดค่าที่ client ส่งมา)
  let apptAt: string | null = null;
  let apptSlot: string | null = null;
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    let bookingId: number | null = b.booking_id ? Number(b.booking_id) : null;

    if (outcome === "agreed" || outcome === "postponed") {
      const typeId = Number(b.service_type_id) ||
        (await new sql.Request(tx).query(
          `SELECT TOP 1 id FROM om_service_type WHERE code = 'cleaning'`)).recordset[0].id;
      // ★ แผน 20261001-01 เฟส 1: ตกลงนัดเก็บช่วงเวลาที่จอง (time_slot) แบบนัดสำรวจ
      //   ส่ง time_slot มา = เวลาเริ่มคิดจากช่องแรก · ไม่ส่ง (หน้าจอเดิม) = คิดช่องจากเวลาเริ่มตามช่วงเดิม
      let when: string | null = null;
      let slot: string | null = null;
      if (outcome === "agreed" && (b.scheduled_at || b.time_slot)) {
        const r = await omSlotsFor(tx, b.scheduled_at, b.time_slot);
        if ("error" in r) {
          await tx.rollback();
          return NextResponse.json({ error: r.error }, { status: 400 });
        }
        when = toThaiOffset(r.at);
        slot = r.slot;
        apptAt = when;
        apptSlot = slot;
      }
      const status = outcome === "agreed" ? "pending" : "follow";

      // ★ ใบงานที่หน้ารายละเอียดเปิดอยู่ (booking_id) มาก่อน ไม่ว่าชนิดไหน — แผน 20260924-02 เฟส 5
      //   เดิมหาด้วยชนิดงาน (ไม่ส่ง = ล้างแผง) ⇒ ใบซ่อมในประกันที่ค้างขั้นติดตาม พอตกลงนัด
      //   ระบบหาใบล้างไม่เจอแล้วสร้างใบล้างใหม่ซ้อน ใบซ่อมค้างอยู่ที่ติดตามตลอดไป
      const cur = (await new sql.Request(tx).input("h", sql.Int, houseId).input("t", sql.Int, typeId)
        .input("bk", sql.Int, bookingId)
        .query(`SELECT TOP 1 id, status, service_type_id FROM om_bookings
                 WHERE house_id = @h AND (id = @bk OR service_type_id = @t)
                   AND status IN (${ACTIVE_STATUS.map((s) => `'${s}'`).join(",")})
                 ORDER BY CASE WHEN id = @bk THEN 0 ELSE 1 END, id DESC`)).recordset[0];

      // ★ แผน 20260924-02 เฟส 2: งานที่อยู่ขั้นเสนอราคา = งานเสียเงิน "เก็บค่าบริการก่อนนัดหมาย"
      //   ห้ามตกลงนัดข้ามขั้นไป (เดิมรายการสถานะเขียนตายตัว ไม่เห็นใบงาน quote แล้วจะสร้างใบงานซ้อน)
      //   ขอเลื่อนได้ แต่ใบงานต้องค้างที่ขั้นเสนอราคาเหมือนเดิม
      if (cur?.status === "quote" && outcome === "agreed") {
        await tx.rollback();
        return NextResponse.json(
          { error: "บ้านนี้อยู่ระหว่างเสนอราคา — นัดได้หลังลูกค้าชำระเงินแล้ว" }, { status: 409 });
      }
      // ★ เฟส 4: ขั้นชำระเงิน ตกลงนัดได้เมื่อ Account ยืนยันรับเงินแล้วเท่านั้น (เก็บค่าบริการก่อนนัดหมาย)
      const paid = cur?.status === "payment"
        ? Boolean((await new sql.Request(tx).input("b", sql.Int, cur.id)
            .query(`SELECT CASE WHEN ${OM_BOOKING_PAID_SQL("bk")} THEN 1 ELSE 0 END paid
                      FROM om_bookings bk WHERE bk.id = @b`)).recordset[0]?.paid)
        : false;
      if (cur?.status === "payment" && outcome === "agreed" && !paid) {
        await tx.rollback();
        return NextResponse.json(
          { error: "ยังไม่ได้รับเงินค่าบริการ — นัดได้หลัง Account ยืนยันรับเงินแล้ว" }, { status: 409 });
      }
      // ★ บ้านสิทธิ์หมดต้องเสนอราคาก่อน (ผู้ใช้เคาะ 28 ก.ย. 69 — ปิดทางลัดตกลงนัดตรง ๆ)
      //   ตรงกับคำตอบข้อ 2 ของแผน 20260924-02 "ต้องเสนอราคาทั้งหมด รวมสิทธิ์หมด" + "เก็บค่าบริการก่อนนัดหมาย"
      //   เดิมบ้านที่ยังไม่มีใบงานกดตกลงนัดได้เลย ปิดงานแล้วสิทธิ์ติดลบ ต้องตามเก็บเงินทีหลัง
      //   กันเฉพาะงานที่กินสิทธิ์ (ล้างแผง) ที่กำลังจะเข้านัดหมายครั้งแรก — ยังไม่มีใบ / ใบค้างขั้นติดตาม
      //   ใบซ่อมในประกันไม่ใช้สิทธิ์ · ใบที่จ่ายแล้ว (payment) ได้สิทธิ์ที่ซื้อตอน Account ยืนยันแล้ว · เลื่อนนัดเดิมไม่กัน
      if (outcome === "agreed" && (!cur || cur.status === "follow")) {
        const need = (await new sql.Request(tx).input("h", sql.Int, houseId)
          .input("t", sql.Int, cur ? Number(cur.service_type_id) : typeId)
          .query(`SELECT CAST(st.consumes_quota AS int) quota,
                         (SELECT ISNULL(SUM(e.balance), 0) FROM om_entitlement_balance e
                           WHERE e.house_id = @h AND e.service_type_id = @t) balance
                    FROM om_service_type st WHERE st.id = @t`)).recordset[0];
        if (need?.quota === 1 && Number(need.balance) <= 0) {
          await tx.rollback();
          return NextResponse.json({ error:
            "บ้านนี้สิทธิ์ล้างหมดแล้ว — ออกใบเสนอราคาที่ขั้น 02 และรับเงินก่อนนัด · ถ้าตัวเลขสิทธิ์ผิด แก้ที่หน้าบ้าน / ระบบติดตั้ง" },
            { status: 409 });
        }
      }
      // ใบงานที่อยู่ขั้นเสนอราคา/ชำระเงิน "ขอเลื่อน" ได้ แต่ต้องค้างขั้นเดิม ห้ามถอยไปติดตาม
      const keep = cur?.status === "quote" || (cur?.status === "payment" && outcome !== "agreed");

      // ★ 29 ก.ย. 69 (แผน 20260929-01): การโทรที่จะเปลี่ยนสถานะใบงานต้องผ่านลำดับสถานะกลาง (canMove) เหมือน PATCH
      //   เดิมหาใบค้างรวมเข้างาน/รอปิดด้วย แล้วตั้งสถานะใหม่ตรง ๆ — กดฟอร์มขั้นติดตามที่ปิดไปแล้ว
      //   "ตกลงนัด" ใบที่ช่างเข้างานแล้วถอยเป็นรอยืนยันนัด · "ขอเลื่อน" ถอยเป็นติดตาม (ประวัติเห็นแค่บันทึกการโทร)
      //   สถานะเดิมซ้ำ (รอยืนยันนัด ตกลงนัดวันใหม่) = อัปเดตวันนัดเหมือนเดิม ไม่นับเป็นการเปลี่ยนสถานะ
      const target = keep ? String(cur?.status) : status;
      if (cur && target !== cur.status && !canMove(String(cur.status), target)) {
        await tx.rollback();
        return NextResponse.json({ error:
          `ใบงาน #${cur.id} อยู่ขั้น "${statusLabel(String(cur.status))}" แล้ว — ${outcome === "agreed" ? "ตกลงนัด" : "ขอเลื่อน"}จากการโทรไม่ได้`
          + (["pending", "confirmed"].includes(String(cur.status)) ? " · เลื่อนนัดใช้ปุ่ม Reschedule ที่ขั้นนัดหมาย" : "") },
          { status: 409 });
      }

      if (cur) {
        bookingId = cur.id as number;
        await new sql.Request(tx).input("id", sql.Int, bookingId)
          .input("s", sql.NVarChar(20), keep ? cur.status : status).input("w", sql.DateTimeOffset, when)
          .input("ts", sql.NVarChar(200), slot)
          .query(`UPDATE om_bookings SET status = @s,
                    scheduled_at = COALESCE(@w, scheduled_at),
                    time_slot = CASE WHEN @w IS NULL THEN time_slot ELSE @ts END,
                    updated_at = SYSDATETIMEOFFSET()
                  WHERE id = @id`);
      } else {
        const ins = await new sql.Request(tx)
          .input("h", sql.Int, houseId).input("t", sql.Int, typeId)
          .input("w", sql.DateTimeOffset, when).input("ts", sql.NVarChar(200), slot)
          .input("s", sql.NVarChar(20), status)
          .input("u", sql.Int, gate.userId ?? null)
          .query(`INSERT INTO om_bookings (house_id, service_type_id, scheduled_at, time_slot, status, created_by, source)
                  OUTPUT INSERTED.id VALUES (@h, @t, @w, @ts, @s, @u, 'call')`);
        bookingId = ins.recordset[0].id as number;
      }
    }

    // เบอร์ผิด → ทำเครื่องหมายว่าใช้ไม่ได้ (ไม่ลบทิ้ง เก็บไว้ในประวัติ)
    //   เฉพาะติดตามทางโทร — "ข้อมูลติดต่อไม่ถูกต้อง" ทาง LINE/เยี่ยม ไม่ได้แปลว่าเบอร์ใช้ไม่ได้
    if (outcome === "wrong_number" && channel === "call" && b.phone)
      await new sql.Request(tx).input("h", sql.Int, houseId).input("p", sql.NVarChar(20), String(b.phone))
        .query(`UPDATE p SET p.status = 'invalid'
                FROM om_customer_phones p
                JOIN om_house_customers hc ON hc.customer_id = p.customer_id
                WHERE hc.house_id = @h AND hc.is_current = 1 AND p.phone = @p`);

    await logBooking(tx, {
      bookingId, houseId, action: "call", actorUserId: gate.userId ?? null,
      to: { outcome, next_date: next, scheduled_at: apptAt ?? b.scheduled_at ?? null, time_slot: apptSlot,
            ...(channel !== "call" ? { channel } : {}), ...(contactDate && contactDate !== today ? { contact_date: contactDate } : {}) },
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
