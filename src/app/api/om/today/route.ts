import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { expireOmGrantsIfDue } from "@/lib/om/entitlement-expiry";
import { OM_FOLLOW_DROP_SQL, OM_FOLLOW_SCOPE_SQL } from "@/lib/om/follow-sql";
import { getSettings } from "@/lib/om/settings";
import { TODAY_TABS } from "@/lib/om/service-view";

// Today ของ O&M (/om/today · แผน docs/plan/20260928-01) — อยู่ในการ์ด O&M เท่านั้น ไม่ปน /today ฝั่งขาย
// ★ ต่อท้าย OM_FOLLOW_SCOPE_SQL ก้อนเดียวกับหน้างานบริการ/ภาพรวม (กติกาใน follow-sql.ts)
//   แถวที่ได้จึงเป็นรูปเดียวกับ /api/om/follow → หน้าใช้ JobCard ตัวเดิมได้เลย
// ★ 1 บ้านอยู่แท็บเดียว — CASE เรียงจากงานที่มีวันนัดก่อน แล้วค่อยงานเงิน แล้วค่อยงานโทร
//   ⇒ ตัวเลขบนแท็บรวมกันได้ ไม่นับซ้ำ
// ★ mine=1 = ติ๊ก "งานของฉัน" แบบ Today ฝั่งขาย — กรองซ้อนทุกแท็บ และตัวเลขบนแท็บขยับตาม
const TAB_SQL = `CASE
    WHEN x.job_status IN ('pending','confirmed','progress','checked') AND x.scheduled_day = @today THEN 'appt_today'
    WHEN x.job_status IN ('pending','confirmed','progress','checked') AND x.scheduled_day < @today  THEN 'overdue'
    WHEN x.job_status IN ('quote','payment')                                                        THEN 'money'
    -- ยังไม่ได้นัด (ไม่มีใบ / ใบขั้นติดตาม / ใบจบแบบยกเลิก-ไม่อยู่บ้าน) + ถึงวันนัดโทรใหม่แล้ว
    -- แท็บติดต่อไม่ได้/ไม่เอาไม่นับ — ระบบเลิกตามเองแล้วตามกติกาในตั้งค่า
    WHEN x.bucket IN ('follow','noquota') AND CAST(x.next_call AS date) <= @today                   THEN 'call_today'
  END`;

const ORDER: Record<string, string> = {
  appt_today: "t.scheduled_at, t.booking_id",
  overdue: "t.scheduled_at, t.booking_id",
  money: "t.booking_id",
  call_today: "t.next_call, t.house_number",
};

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const u = req.nextUrl.searchParams;
  const tab = TODAY_TABS.some((t) => t.k === u.get("tab")) ? String(u.get("tab")) : TODAY_TABS[0].k;
  const q = (u.get("q") ?? "").trim();
  const mineOnly = u.get("mine") === "1" ? (gate.userId ?? 0) : 0;
  // ไม่แบ่งหน้า — งานวันนี้ปกติไม่กี่สิบใบ · เกินเพดาน หน้าบอก "แสดง N จาก M" ให้รู้ว่ามีอีก
  const size = Math.min(200, Math.max(10, Number(u.get("size")) || 200));

  const cfg = await getSettings("call.");
  const db = await getOmDb();
  await expireOmGrantsIfDue(db);
  try {
    const r = await db.request()
      .input("max", sql.Int, Number(cfg["call.max_attempts"] ?? 3))
      .input("tab", sql.VarChar(20), tab)
      .input("mine", sql.Int, mineOnly)
      .input("q", sql.NVarChar(80), q ? `%${q}%` : "")
      .input("size", sql.Int, size)
      .query(`
      DECLARE @today date = CAST(SWITCHOFFSET(SYSDATETIMEOFFSET(), '+07:00') AS date);
      ${OM_FOLLOW_SCOPE_SQL}

      SELECT x.*, ${TAB_SQL} today_tab INTO #t FROM #x x;

      -- ตัวเลขบนแท็บกรองเหมือนรายการ (งานของฉัน + คำค้น) แบบ Today ฝั่งขาย — กดแล้วเห็นเท่าเลขเสมอ
      SELECT today_tab, COUNT(*) n FROM #t
       WHERE today_tab IS NOT NULL AND (@mine = 0 OR owner_user_id = @mine)
         AND (@q = '' OR house_number LIKE @q OR customer_name LIKE @q OR phone LIKE @q)
       GROUP BY today_tab;

      SELECT TOP (@size) t.* FROM #t t
       WHERE t.today_tab = @tab
         AND (@mine = 0 OR t.owner_user_id = @mine)
         AND (@q = '' OR t.house_number LIKE @q OR t.customer_name LIKE @q OR t.phone LIKE @q)
       ORDER BY ${ORDER[tab]};

      DROP TABLE #t;
      ${OM_FOLLOW_DROP_SQL}`);
    const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
    const counts: Record<string, number> = {};
    for (const x of rs[0]) counts[String(x.today_tab)] = Number(x.n);
    return NextResponse.json({ counts, items: fixDates(rs[1]), tab });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "อ่านงานวันนี้ไม่สำเร็จ" }, { status: 500 });
  }
}
