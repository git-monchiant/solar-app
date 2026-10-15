import { B2B_PENDING_PRICE_SUB } from "./materials";
import { PROJECT_SUB_SQL } from "./project-server";

// แถวสรุปให้ /api/journey-summary — รูปแบบเดียวกับฝั่งขาย ({journey_step, journey_sub, n})
// รายการ Master ที่ยังใช้งานแต่ Purchase ยังไม่ใส่ราคา · ไม่มีเลย = ไม่คืนแถว (badge ไม่ขึ้น)
export const B2B_JOURNEY_SUMMARY_SQL = `
  SELECT CAST(NULL AS INT) AS journey_step, ${B2B_PENDING_PRICE_SUB} AS journey_sub, COUNT(*) AS n
  FROM b2b_materials
  WHERE is_active = 1 AND unit_price IS NULL
  HAVING COUNT(*) > 0`;

// โครงการ B2B ตามขั้น (สาย 3000) + ขั้นย่อย — แผน 20261015-07 · ขั้นย่อยคิดตอนอ่านจึงห่อ subquery ก่อน GROUP BY
export const B2B_PROJECT_SUMMARY_SQL = `
  SELECT x.stage AS journey_step, x.sub AS journey_sub, COUNT(*) AS n
  FROM (SELECT p.stage, ${PROJECT_SUB_SQL("p")} AS sub FROM b2b_projects p) x
  GROUP BY x.stage, x.sub`;
