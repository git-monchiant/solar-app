import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { HG, HIDDEN_GROUPS, GROUP_LABEL, bucketSql } from "@/lib/om/house-scope";
import { CLEANING_CYCLE_SQL, isCleaning } from "@/lib/om/entitlement";

// กลุ่มโครงการสำหรับลิสต์ซ้ายของหน้าบ้าน — logic การจัดกลุ่มอยู่ที่ src/lib/om/house-scope.ts
// (ใช้ร่วมกับ /api/om/houses เพื่อให้ตัวเลขหัวกลุ่ม = จำนวนที่เปิดเข้าไปเห็นจริง)
// VIP เก็บชื่อคนไว้ในช่องโครงการ ("บ้านคุณปลิว") จึงรวมเป็นกลุ่มเดียว ไม่งั้นแตกเป็น 31 กลุ่มกลุ่มละหลัง

type Group = {
  grp: string; pid: string | null; name: string; special: boolean; nonHouse: boolean; hidden: boolean;
  houses: number; vip: number; nophone: number; nowarr: number;
  noinv: number; nocust: number; duewash: number; nosolar: number; nospec: number; bal: number;
};

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const db = await getOmDb();
  // ★ สรุปตารางลูกลง #temp ก่อนแล้วค่อย join — correlated subquery รายบ้าน 6 ตัว
  //   ใช้เวลา 6.7 วินาที (วัดจริง 1 ก.ย.) ส่วนแบบนี้จบใน ~0.3 วินาที
  const r = await db.request().query(`
    SELECT i.house_id, COUNT(*) n_sys,
           MAX(CASE WHEN i.warranty_start IS NOT NULL THEN 1 ELSE 0 END) has_warr,
           MAX(CASE WHEN i.inverter_brand IS NOT NULL THEN 1 ELSE 0 END) has_inv,
           -- โอนแล้ว (REM มีสัญญาผูก) — ใช้จัด bucket "แสดง/ซ่อน"
           MAX(CASE WHEN i.rem_contract_id IS NOT NULL THEN 1 ELSE 0 END) has_rem,
           -- "มีสเปกระบบ" = รู้อย่างน้อยหนึ่งใน kWp / ยี่ห้ออินเวอร์เตอร์ / SN  (นิยามเดียวกับ filter=nospec)
           MAX(CASE WHEN i.rem_size_kwp IS NOT NULL OR i.inverter_brand IS NOT NULL
                         OR i.inverter_sn IS NOT NULL
                         -- ★ ขนาดที่ได้จากโปรฯ ของ REM ก็ถือว่ารู้สเปกแล้ว (เติมเข้ามา 2 ก.ย.)
                         OR i.promo_size_kw IS NOT NULL THEN 1 ELSE 0 END) has_spec
    INTO #inst FROM om_installations i GROUP BY i.house_id;

    -- ★ นับเฉพาะสิทธิ์/ใบตัดสิทธิ์ของ "ล้างแผง" — แพ็คชนิดอื่นแยกยอดกัน ไม่ปนหัวกลุ่ม
    SELECT i.house_id, ISNULL(SUM(g.qty), 0) granted
    INTO #grant FROM om_entitlement_grants g
    JOIN om_installations i ON i.id = g.installation_id
    WHERE ${isCleaning("g")} GROUP BY i.house_id;

    SELECT i.house_id, COUNT(*) used, MAX(rd.service_date) last_wash
    INTO #red FROM om_redemptions rd
    JOIN om_installations i ON i.id = rd.installation_id
    WHERE rd.status <> 'void' AND ${isCleaning("rd")} GROUP BY i.house_id;

    SELECT hc.house_id, MAX(CASE WHEN p.phone IS NOT NULL THEN 1 ELSE 0 END) has_phone, COUNT(DISTINCT hc.customer_id) n_cust
    INTO #cust FROM om_house_customers hc
    LEFT JOIN om_customer_phones p ON p.customer_id = hc.customer_id
    WHERE hc.is_current = 1 GROUP BY hc.house_id;

    SELECT grp, MAX(pid) pid, MAX(name) name, COUNT(*) houses,
           SUM(vip) vip, SUM(nophone) nophone, SUM(nowarr) nowarr,
           SUM(noinv) noinv, SUM(nocust) nocust, SUM(duewash) duewash, SUM(nosolar) nosolar,
           SUM(nospec) nospec, SUM(bal) bal
    FROM (
      SELECT
        ${bucketSql({
          seg: "h.segment", vip: "h.is_vip", demo: "ISNULL(pj.is_demo, 0)",
          unit: "ISNULL(h.unit_status, N'')", pid: "h.project_id",
          washed: "CASE WHEN rd.last_wash IS NOT NULL THEN 1 ELSE 0 END",
          rem: "ISNULL(ins.has_rem, 0)",
        })} grp,
        h.project_id pid, ISNULL(pj.name_th, h.project_name) name, CAST(h.is_vip AS int) vip,
        CASE WHEN ISNULL(c.has_phone, 0) = 0 THEN 1 ELSE 0 END nophone,
        CASE WHEN ISNULL(ins.has_warr, 0) = 0 THEN 1 ELSE 0 END nowarr,
        CASE WHEN ISNULL(ins.has_inv, 0) = 0 THEN 1 ELSE 0 END noinv,
        CASE WHEN ISNULL(c.n_cust, 0) = 0 THEN 1 ELSE 0 END nocust,
        -- ★ 50 หลังที่ตอนนำเข้าจดไว้ว่า "ไม่ติดโซลาร์เซลล์" — มีแถวระบบติดตั้งแต่ไม่มี kWp/อินเวอร์เตอร์
        CASE WHEN h.has_solar = 0 THEN 1 ELSE 0 END nosolar,
        -- รอตรวจ: ไม่มีสเปกระบบ และไม่เคยล้าง — จับไม่ได้ว่ามีโซลาร์จริงไหม
        CASE WHEN ISNULL(ins.has_spec, 0) = 0 AND rd.last_wash IS NULL THEN 1 ELSE 0 END nospec,
        CASE WHEN rd.last_wash IS NULL
               OR DATEADD(month, ${CLEANING_CYCLE_SQL}, rd.last_wash) <= SYSDATETIMEOFFSET() THEN 1 ELSE 0 END duewash,
        ISNULL(gr.granted, 0) - ISNULL(rd.used, 0) bal
      FROM om_houses h
      LEFT JOIN om_projects pj ON pj.project_id = h.project_id
      LEFT JOIN #inst ins ON ins.house_id = h.id
      LEFT JOIN #grant gr ON gr.house_id = h.id
      LEFT JOIN #red rd  ON rd.house_id = h.id
      LEFT JOIN #cust c  ON c.house_id = h.id
      WHERE h.is_om = 1
    ) x GROUP BY grp;

    -- ★ บ้านที่ "เราสั่งซ่อน" — is_om = 0 แล้ว จึงไม่อยู่ในสรุปข้างบน ต้องนับแยก
    SELECT COUNT(*) hidden FROM om_houses WHERE om_excluded_reason IS NOT NULL;

    DROP TABLE #inst; DROP TABLE #grant; DROP TABLE #red; DROP TABLE #cust;`);

  const nonHouseKeys: string[] = [HG.CONDO, HG.SALES, HG.FACILITY];
  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  const groups: Group[] = rs[0].map((g) => {
    const key = String(g.grp);
    const special = key in GROUP_LABEL;
    return {
      ...(g as unknown as Group),
      name: GROUP_LABEL[key] ?? String(g.name ?? ""),
      pid: special ? null : (g.pid as string | null),
      special,
      hidden: HIDDEN_GROUPS.includes(key),      // ซ่อนจากลิสต์หลัก (คอนโด/สนง.ขาย/ส่วนกลาง/ยังไม่ขาย/บ้านตัวอย่าง)
      nonHouse: nonHouseKeys.includes(key),     // ไม่ใช่แนวราบ (subset ของ hidden)
    };
  }).sort((a, b) =>
    Number(a.hidden) - Number(b.hidden) || Number(a.special) - Number(b.special) || b.houses - a.houses);

  const sum = (k: keyof Group) => groups.reduce((s, g) => s + (Number(g[k]) || 0), 0);
  return NextResponse.json({
    groups,
    stats: {
      total: sum("houses"), nophone: sum("nophone"), nowarr: sum("nowarr"),
      noinv: sum("noinv"), nocust: sum("nocust"), duewash: sum("duewash"), nosolar: sum("nosolar"),
      nospec: sum("nospec"), hidden: Number(rs[1]?.[0]?.hidden ?? 0),
    },
  });
}
