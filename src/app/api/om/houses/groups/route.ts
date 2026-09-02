import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";

// กลุ่มโครงการสำหรับลิสต์ซ้ายของหน้าบ้าน — VIP กับไซต์บริษัทรวมเป็นกลุ่มเดียว
// เพราะ VIP 31 หลังเก็บชื่อคนไว้ในช่องโครงการ ("บ้านคุณปลิว") ถ้าไม่รวมจะแตกเป็น 31 กลุ่มกลุ่มละหลัง
export const GROUP_VIP = "__VIP__";
export const GROUP_CONDO = "__CONDO__";
export const GROUP_SALES = "__SALES__";
export const GROUP_FACILITY = "__FACILITY__";
export const GROUP_DEMO = "__DEMO__";
export const GROUP_GENERAL = "__NOPJ__";  // บ้านนอกโครงการเสนาที่ไม่ใช่ VIP = ลูกค้าทั่วไป (ซื้อโซลาร์เอง)
// กลุ่มที่ "ไม่ใช่บ้านลูกค้า" — ซ่อนจากลิสต์และตัวนับตามค่าเริ่มต้น
export const NON_HOUSE_GROUPS = [GROUP_CONDO, GROUP_SALES, GROUP_FACILITY, GROUP_DEMO];

type Group = {
  grp: string; pid: string | null; name: string; special: boolean; nonHouse: boolean;
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
           -- "มีสเปกระบบ" = รู้อย่างน้อยหนึ่งใน kWp / ยี่ห้ออินเวอร์เตอร์ / SN  (นิยามเดียวกับ filter=nospec)
           MAX(CASE WHEN i.rem_size_kwp IS NOT NULL OR i.inverter_brand IS NOT NULL
                         OR i.inverter_sn IS NOT NULL THEN 1 ELSE 0 END) has_spec
    INTO #inst FROM om_installations i GROUP BY i.house_id;

    SELECT i.house_id, ISNULL(SUM(g.qty), 0) granted
    INTO #grant FROM om_entitlement_grants g
    JOIN om_installations i ON i.id = g.installation_id GROUP BY i.house_id;

    SELECT i.house_id, COUNT(*) used, MAX(rd.service_date) last_wash
    INTO #red FROM om_redemptions rd
    JOIN om_installations i ON i.id = rd.installation_id
    WHERE rd.status <> 'void' GROUP BY i.house_id;

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
        CASE WHEN h.is_vip = 1 THEN '${GROUP_VIP}'
             WHEN pj.is_demo = 1 THEN '${GROUP_DEMO}'
             WHEN h.segment = 'condo' THEN '${GROUP_CONDO}'
             WHEN h.segment = 'sales_office' THEN '${GROUP_SALES}'
             WHEN h.segment = 'facility' THEN '${GROUP_FACILITY}'
             ELSE ISNULL(h.project_id, '${GROUP_GENERAL}') END grp,
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
               OR DATEDIFF(day, rd.last_wash, SYSDATETIMEOFFSET()) > 365 THEN 1 ELSE 0 END duewash,
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

  const label: Record<string, string> = {
    [GROUP_VIP]: "VIP · นอกโครงการ",
    [GROUP_CONDO]: "คอนโด",
    [GROUP_SALES]: "สำนักงานขาย",
    [GROUP_FACILITY]: "ส่วนกลาง",
    [GROUP_DEMO]: "บ้านตัวอย่าง · Demo",
    [GROUP_GENERAL]: "ลูกค้าทั่วไป · นอกโครงการ",
  };
  const rs = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  const groups: Group[] = rs[0].map((g) => {
    const key = String(g.grp);
    return {
      ...(g as unknown as Group),
      name: label[key] ?? String(g.name ?? ""),
      pid: label[key] ? null : (g.pid as string | null),
      special: key in label,
      nonHouse: NON_HOUSE_GROUPS.includes(key),
    };
  }).sort((a, b) => Number(a.special) - Number(b.special) || b.houses - a.houses);

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
