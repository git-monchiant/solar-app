import { NextRequest, NextResponse } from "next/server";
import { expireOmGrantsIfDue } from "@/lib/om/entitlement-expiry";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { DUE_WASH_SQL, isCleaning } from "@/lib/om/entitlement";
import { OM_FOLLOW_DROP_SQL, OM_FOLLOW_SCOPE_SQL } from "@/lib/om/follow-sql";
import { ACTIVE_STATUS } from "@/lib/om/booking";
import { getSettings } from "@/lib/om/settings";
import { countOmUnread } from "@/lib/om/notifications";

// ภาพรวม O&M (เฟส 6 ของแผน 20260922-01) — ตัวเลขหน้าเดียวที่ตอบว่า "งานกองอยู่ตรงไหน"
//
// ★ ตัวเลขทุกตัวบนหน้านี้ต้องกดเข้าไปเห็นของจริงได้ (กติกา ui-rules)
//   ⇒ ช่องแท็บ/โครงการ นับจาก #x ของ OM_FOLLOW_SCOPE_SQL ตัวเดียวกับหน้ารายการ
//     ไม่เขียนเกณฑ์ขึ้นใหม่ (เฟส 1 เคยเขียนใหม่แล้ว badge เกินจริง 190 หลัง)
//
// ★ ทะเบียนบ้าน/สิทธิ์นับแยกจาก #x โดยตั้งใจ — #x คือ "งานที่ต้องทำ" ส่วนทะเบียนคือ
//   "ของที่ดูแลอยู่ทั้งหมด" บ้านที่ยังไม่ถึงรอบก็ยังเป็นบ้านในความดูแล

const ALIVE = ACTIVE_STATUS.map((s) => `'${s}'`).join(",");

/** เคยล้างอย่างน้อย 1 ครั้ง — คู่ตรงข้ามของ "ไม่เคยล้างเลย" ในการ์ดทะเบียนบ้าน (alias บ้านชื่อ h) */
const EVER_WASHED_SQL = `EXISTS (
        SELECT 1 FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id
         WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isCleaning("rd")})`;

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const cfg = await getSettings("call.");
  const maxAttempts = Number(cfg["call.max_attempts"] ?? 3);

  const db = await getOmDb();
  await expireOmGrantsIfDue(db);   // สิทธิ์ที่หมดอายุตัดวันละครั้ง ก่อนอ่านยอด (แผน 20260924-02 เฟส 4)
  const r = await db.request()
    .input("max", sql.Int, maxAttempts)
    .query(`
    ${OM_FOLLOW_SCOPE_SQL}

    -- ① งานแยกตามแท็บ — ชุดเดียวกับชิปบนหน้ารายการ
    SELECT bucket, COUNT(*) n FROM #x GROUP BY bucket;

    -- ② งานแยกตามโครงการ (เอาที่ยังโทรได้ขึ้นก่อน) — กดแล้วเด้งไปลิสต์ที่กรองโครงการนั้น
    SELECT TOP 12 d.project_id, MAX(d.project_name) project_name,
           COUNT(*) total,
           SUM(CASE WHEN d.bucket = 'follow' THEN 1 ELSE 0 END) follow
      FROM #x d GROUP BY d.project_id
     ORDER BY SUM(CASE WHEN d.bucket = 'follow' THEN 1 ELSE 0 END) DESC, COUNT(*) DESC;

    -- ③ เจ้าของเคส (เฟส 4) — ใบงานที่ยังไม่ปิด · NULL = ยังไม่มีใครรับ
    SELECT b.owner_user_id, u.full_name owner_name, COUNT(*) n
      FROM om_bookings b LEFT JOIN users u ON u.id = b.owner_user_id
     WHERE b.status IN (${ALIVE})
     GROUP BY b.owner_user_id, u.full_name ORDER BY n DESC;

    -- ④ ทีมช่าง — ทุกทีมที่เปิดใช้ ถึงยังไม่มีงานก็ต้องเห็น (จะได้รู้ว่าทีมไหนว่าง)
    SELECT t.id team_id, t.name team_name,
           (SELECT COUNT(*) FROM om_bookings b WHERE b.team_id = t.id AND b.status IN (${ALIVE})) n
      FROM om_teams t WHERE t.is_active = 1 ORDER BY n DESC, t.id;

    ${OM_FOLLOW_DROP_SQL}

    -- ⑤ ทะเบียนบ้าน — ถึงรอบ/ยังไม่ถึงรอบ และในกลุ่มถึงรอบมีที่ยังไม่เคยล้างกี่หลัง
    --   ★ SUM(CASE WHEN EXISTS(...)) ตรง ๆ ไม่ได้ SQL Server ห้าม aggregate ครอบ subquery
    --     ต้องคลี่เป็น derived table ก่อน
    SELECT COUNT(*) houses, SUM(due) due, SUM(never_washed) never_washed FROM (
      SELECT CASE WHEN ${DUE_WASH_SQL} THEN 1 ELSE 0 END due,
             CASE WHEN ${DUE_WASH_SQL} AND NOT ${EVER_WASHED_SQL} THEN 1 ELSE 0 END never_washed
        FROM om_houses h
       WHERE h.is_om = 1 AND EXISTS (SELECT 1 FROM om_installations i WHERE i.house_id = h.id)) a;

    -- ⑥ สิทธิ์ล้างแผง — ให้ไว้เท่าไร ใช้ไปเท่าไร (เฉพาะบ้านที่ยังอยู่ใน O&M)
    SELECT
      (SELECT ISNULL(SUM(g.qty), 0) FROM om_entitlement_grants g
         JOIN om_installations i ON i.id = g.installation_id
         JOIN om_houses h ON h.id = i.house_id
        WHERE h.is_om = 1 AND ${isCleaning("g")}) granted,
      (SELECT COUNT(*) FROM om_redemptions rd
         JOIN om_installations i ON i.id = rd.installation_id
         JOIN om_houses h ON h.id = i.house_id
        WHERE h.is_om = 1 AND rd.status <> 'void' AND ${isCleaning("rd")}) used;

    -- ⑦ งานล้างที่ทำจริงย้อนหลัง 12 เดือน — เส้นวัดกำลังการผลิตของทีม
    SELECT FORMAT(rd.service_date, 'yyyy-MM') ym, COUNT(*) n
      FROM om_redemptions rd
     WHERE rd.status <> 'void' AND ${isCleaning("rd")}
       AND rd.service_date >= DATEADD(month, -11, DATEFROMPARTS(YEAR(SYSDATETIMEOFFSET()), MONTH(SYSDATETIMEOFFSET()), 1))
     GROUP BY FORMAT(rd.service_date, 'yyyy-MM') ORDER BY ym;`);

  // แจ้งเตือนที่ยังไม่อ่านของคนที่เปิดหน้านี้ — กล่องของ O&M เอง ไม่ใช่กระดิ่งกลางของฝั่งขาย
  const unread = await countOmUnread(db, gate.userId);

  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  const num = (v: unknown) => Number(v ?? 0);

  const buckets: Record<string, number> = {};
  for (const x of rs[0]) buckets[String(x.bucket)] = num(x.n);

  const houses = rs[4][0] ?? {};
  const quota = rs[5][0] ?? {};

  return NextResponse.json({
    unread,
    buckets,
    jobs_total: Object.values(buckets).reduce((a, b) => a + b, 0),
    houses: {
      total: num(houses.houses),
      due: num(houses.due),
      never_washed: num(houses.never_washed),
      not_due: num(houses.houses) - num(houses.due),
    },
    quota: {
      granted: num(quota.granted),
      used: num(quota.used),
      left: num(quota.granted) - num(quota.used),
    },
    projects: rs[1].map((x) => ({
      project_id: x.project_id == null ? null : String(x.project_id),
      project_name: x.project_name == null ? null : String(x.project_name),
      total: num(x.total), follow: num(x.follow),
    })),
    owners: rs[2].map((x) => ({
      owner_user_id: x.owner_user_id == null ? null : num(x.owner_user_id),
      owner_name: x.owner_name == null ? null : String(x.owner_name),
      n: num(x.n),
    })),
    teams: rs[3].map((x) => ({ team_id: num(x.team_id), team_name: String(x.team_name), n: num(x.n) })),
    months: rs[6].map((x) => ({ ym: String(x.ym), n: num(x.n) })),
  });
}
