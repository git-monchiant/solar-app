import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { fixDates, sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { HIDDEN_GROUPS, bucketSql } from "@/lib/om/house-scope";

// ทะเบียนบ้าน/ระบบติดตั้ง — ค้นหา + กรอง + แบ่งหน้า
// สิทธิ์ล้างอยู่ที่บ้าน (installations → grants/redemptions) ไม่ใช่ที่คน

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const u = req.nextUrl.searchParams;
  const q = (u.get("q") ?? "").trim();
  const seg = (u.get("segment") ?? "").trim();
  const filter = u.get("filter") ?? "";           // vip | nosolar | nowarr | noted | multi | duewash | nophone | noinv | nocust
  const proj = (u.get("project") ?? "").trim();   // project_id | __none__ (ไม่ระบุโครงการ)
  const grp = (u.get("group") ?? "").trim();      // ว่าง/__ALL__ = ลิสต์หลัก (แสดง) | __VIP__ | __NOPJ__ | __CONDO__/__SALES__/__FACILITY__/__UNSOLD__/__DEMO__ (ซ่อน) | project_id
  const page = Math.max(1, Number(u.get("page")) || 1);
  const size = Math.min(100, Math.max(10, Number(u.get("size")) || 30));

  const db = await getOmDb();
  const r = db.request()
    .input("q", sql.NVarChar(120), `%${q}%`)
    .input("qp", sql.VarChar(24), `%${q.replace(/\D/g, "") || " "}%`)
    .input("seg", sql.NVarChar(20), seg)
    .input("pid", sql.NVarChar(20), proj)
    .input("grp", sql.NVarChar(20), grp)
    .input("off", sql.Int, (page - 1) * size)
    .input("size", sql.Int, size);

  // ★ "ซ่อนไว้" เป็นแท็บเดียวที่ต้องข้ามเงื่อนไข is_om = 1 (เพราะของที่ซ่อน is_om = 0)
  //   และต้องดูเฉพาะที่ "เราสั่งซ่อน" ไม่ใช่บ้าน is_om=0 อีก 3,113 หลังที่ไม่เคยอยู่ในขอบเขต O&M
  const showHidden = filter === "hidden";
  const extra =
    filter === "vip"     ? "AND h.is_vip = 1" :
    filter === "nosolar" ? "AND h.has_solar = 0" :
    // รอตรวจ: ไม่มีสเปกระบบเลย (ไม่รู้ kWp / อินเวอร์เตอร์ / SN) — 222 หลังที่ยังไม่กล้าซ่อน
    filter === "nospec"  ? `AND NOT EXISTS (SELECT 1 FROM om_installations i WHERE i.house_id = h.id
        AND (i.rem_size_kwp IS NOT NULL OR i.inverter_brand IS NOT NULL OR i.inverter_sn IS NOT NULL
             OR i.promo_size_kw IS NOT NULL))
      AND NOT EXISTS (SELECT 1 FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id
        WHERE i.house_id = h.id AND rd.status <> 'void')` :
    filter === "nowarr"  ? `AND NOT EXISTS (SELECT 1 FROM om_installations i WHERE i.house_id = h.id AND i.warranty_start IS NOT NULL)` :
    filter === "noted"   ? "AND h.note IS NOT NULL AND h.note <> ''" :
    filter === "multi"   ? `AND (SELECT COUNT(*) FROM om_installations i WHERE i.house_id = h.id) > 1` :
    filter === "nophone" ? `AND NOT EXISTS (SELECT 1 FROM om_house_customers hc
        JOIN om_customer_phones p ON p.customer_id = hc.customer_id
        WHERE hc.house_id = h.id AND hc.is_current = 1)` :
    filter === "noinv"   ? `AND NOT EXISTS (SELECT 1 FROM om_installations i WHERE i.house_id = h.id AND i.inverter_brand IS NOT NULL)` :
    filter === "nocust"  ? `AND NOT EXISTS (SELECT 1 FROM om_house_customers hc WHERE hc.house_id = h.id AND hc.is_current = 1)` :
    // ถึงคิวล้าง = ไม่เคยล้าง หรือล้างล่าสุดเกิน 1 ปี
    filter === "duewash" ? `AND NOT EXISTS (SELECT 1 FROM om_redemptions rd
        JOIN om_installations i ON i.id = rd.installation_id
        WHERE i.house_id = h.id AND rd.status <> 'void'
          AND DATEDIFF(day, rd.service_date, SYSDATETIMEOFFSET()) <= 365)` : "";

  // ★ ใช้ temp table แทน CTE ซ้อน — วัดจริง 1 ก.ย.: CTE(hit→base→page) ถูก optimizer
  //   ขยาย inline จน plan พัง 22 วินาที · #temp จบใน ~100ms เพราะ materialize ครั้งเดียว
  // ★ กรอง "กลุ่ม" ด้วย bucket จาก #scope (logic เดียวกับ /groups) — ตัวเลขหัวกลุ่ม = ที่เห็นจริง
  //   __ALL__/ว่าง (ไม่ค้นหา) = ลิสต์หลัก แสดงเฉพาะ bucket ที่ไม่ซ่อน · เลือกกลุ่มเจาะจง = bucket นั้น
  //   กำลังค้นหา (@q) → ข้ามตัวกรองกลุ่ม ค้นทั้งระบบ (เจอบ้านในกลุ่มซ่อนด้วย)
  // correlated EXISTS แพงถ้าเรียกทุกแถวใน WHERE — คำนวณ bucket ครั้งเดียวลง #scope แล้ว join
  const bucketExpr = bucketSql({
    seg: "h.segment", vip: "h.is_vip", demo: "ISNULL(pj.is_demo, 0)",
    unit: "ISNULL(h.unit_status, N'')", pid: "h.project_id",
    washed: "(CASE WHEN EXISTS(SELECT 1 FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id WHERE i.house_id = h.id AND rd.status <> 'void') THEN 1 ELSE 0 END)",
    rem: "(CASE WHEN EXISTS(SELECT 1 FROM om_installations i WHERE i.house_id = h.id AND i.rem_contract_id IS NOT NULL) THEN 1 ELSE 0 END)",
  });
  const hiddenList = HIDDEN_GROUPS.map((g) => `N'${g}'`).join(", ");
  const scopeFilter = showHidden ? "" : `
      AND ( @q <> N'%%'
        OR (@grp IN (N'', N'__ALL__') AND sc.bucket NOT IN (${hiddenList}))
        OR sc.bucket = @grp )`;

  const where = `WHERE ${showHidden ? "h.om_excluded_reason IS NOT NULL" : "h.is_om = 1"} ${extra}
      AND (@seg = N'' OR h.segment = @seg)
      AND (@pid = N'' OR (@pid = N'__none__' AND h.project_id IS NULL) OR h.project_id = @pid)
      ${scopeFilter}
      AND (@q = N'%%'
        OR h.house_number LIKE @q OR h.project_name LIKE @q OR pj.name_th LIKE @q
        OR h.id IN (SELECT house_id FROM #hit))`;

  // ★ เรียงตามบ้านเลขที่แบบ "ตัวเลข" ไม่ใช่ตัวอักษร
  //   ถ้าเรียงเป็น string จะได้ 49/1 · 49/10 · 49/101 · 49/102 … · 49/2  ซึ่งอ่านไม่รู้เรื่อง
  //   บ้านเลขที่ในฐาน: มี / 1,506 · ไม่มี / 35 · มีตัวอักษร 2 (เช่น "อาคารสโมสร") → ตัวอักษรไปท้ายสุด
  const HN_A = `TRY_CAST(NULLIF(LTRIM(RTRIM(LEFT(h.house_number, CHARINDEX('/', h.house_number + '/') - 1))), '') AS int)`;
  const HN_B = `TRY_CAST(NULLIF(LTRIM(RTRIM(SUBSTRING(h.house_number, CHARINDEX('/', h.house_number + '/') + 1, 50))), '') AS int)`;
  // ดูทุกโครงการรวมกัน → เรียงชื่อโครงการก่อน ไม่งั้นบ้านเลขที่ของคนละโครงการจะสลับกันมั่ว
  const orderBy = `ORDER BY
    ${grp === "" || grp === "__ALL__" ? "ISNULL(pj.name_th, h.project_name)," : ""}
    CASE WHEN ${HN_A} IS NULL THEN 1 ELSE 0 END, ${HN_A}, ${HN_B}, h.house_number, h.id`;

  const rows = await r.query(`
    SELECT DISTINCT x.house_id INTO #hit FROM (
      SELECT hc.house_id FROM om_house_customers hc
      JOIN om_customers c ON c.id = hc.customer_id
      WHERE @q <> N'%%' AND hc.is_current = 1 AND c.full_name LIKE @q
      UNION ALL
      SELECT hc.house_id FROM om_house_customers hc
      JOIN om_customer_phones p ON p.customer_id = hc.customer_id
      WHERE @q <> N'%%' AND p.phone LIKE @qp
    ) x;

    ${showHidden ? "" : `SELECT h.id, ${bucketExpr} bucket INTO #scope
    FROM om_houses h LEFT JOIN om_projects pj ON pj.project_id = h.project_id
    WHERE h.is_om = 1;`}

    SELECT h.id INTO #page
    FROM om_houses h LEFT JOIN om_projects pj ON pj.project_id = h.project_id
    ${showHidden ? "" : "LEFT JOIN #scope sc ON sc.id = h.id"}
    ${where}
    ${orderBy} OFFSET @off ROWS FETCH NEXT @size ROWS ONLY;

    SELECT COUNT(*) total
    FROM om_houses h LEFT JOIN om_projects pj ON pj.project_id = h.project_id
    ${showHidden ? "" : "LEFT JOIN #scope sc ON sc.id = h.id"}
    ${where};

    SELECT h.id, h.house_number, ISNULL(pj.name_th, h.project_name) project_name, h.project_id, h.segment,
      h.is_vip, h.has_solar, h.unit_status, h.note, h.om_excluded_reason,
      CONVERT(varchar(33), h.om_excluded_at, 126) om_excluded_at,
      (SELECT COUNT(*) FROM om_installations i WHERE i.house_id = h.id) system_count,
      -- ขนาดระบบ: ไฟล์นำเข้าก่อน · ถ้าไม่มีใช้ที่แกะจากโปรฯ REM (promo_size_kw)
      (SELECT STRING_AGG(CAST(COALESCE(i.rem_size_kwp, i.promo_size_kw) AS varchar(12)), ' + ') FROM om_installations i
       WHERE i.house_id = h.id AND COALESCE(i.rem_size_kwp, i.promo_size_kw) IS NOT NULL) kwp_list,
      (SELECT MIN(CONVERT(char(10), i.warranty_start, 23)) FROM om_installations i
       WHERE i.house_id = h.id AND i.warranty_start IS NOT NULL) warranty_start,
      (SELECT ISNULL(SUM(g.qty), 0) FROM om_entitlement_grants g JOIN om_installations i ON i.id = g.installation_id
       WHERE i.house_id = h.id)
      - (SELECT COUNT(*) FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id
         WHERE i.house_id = h.id AND rd.status <> 'void') balance,
      (SELECT CONVERT(char(10), MAX(rd.service_date), 23) FROM om_redemptions rd
       JOIN om_installations i ON i.id = rd.installation_id
       WHERE i.house_id = h.id AND rd.status <> 'void') last_wash,
      (SELECT COUNT(*) FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id
       WHERE i.house_id = h.id AND rd.status <> 'void') wash_count,
      (SELECT TOP 1 c.full_name FROM om_house_customers hc JOIN om_customers c ON c.id = hc.customer_id
       WHERE hc.house_id = h.id AND hc.is_current = 1
       ORDER BY CASE hc.role WHEN 'owner' THEN 0 ELSE 1 END, hc.id) customer_name,
      (SELECT TOP 1 p.phone FROM om_house_customers hc
       JOIN om_customer_phones p ON p.customer_id = hc.customer_id
       WHERE hc.house_id = h.id AND hc.is_current = 1
       ORDER BY p.is_primary DESC, p.id) customer_phone,
      (SELECT COUNT(*) FROM om_house_customers hc WHERE hc.house_id = h.id AND hc.is_current = 1) customer_count,
      CASE WHEN EXISTS (SELECT 1 FROM om_bookings b WHERE b.house_id = h.id
                        AND b.status IN ('NEW','CONFIRMED','IN_PROGRESS')) THEN 1 ELSE 0 END has_booking
    FROM #page pg
    JOIN om_houses h ON h.id = pg.id
    LEFT JOIN om_projects pj ON pj.project_id = h.project_id
    ${orderBy};

    DROP TABLE #hit; DROP TABLE #page;${showHidden ? "" : " DROP TABLE #scope;"}`);

  const rs = rows.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  return NextResponse.json({ houses: fixDates(rs[1]), total: rs[0][0].total, page, size });
}
