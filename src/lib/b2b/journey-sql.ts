import { B2B_PENDING_PRICE_SUB } from "./materials";

// แถวสรุปให้ /api/journey-summary — รูปแบบเดียวกับฝั่งขาย ({journey_step, journey_sub, n})
// รายการ Master ที่ยังใช้งานแต่ Purchase ยังไม่ใส่ราคา · ไม่มีเลย = ไม่คืนแถว (badge ไม่ขึ้น)
export const B2B_JOURNEY_SUMMARY_SQL = `
  SELECT CAST(NULL AS INT) AS journey_step, ${B2B_PENDING_PRICE_SUB} AS journey_sub, COUNT(*) AS n
  FROM b2b_materials
  WHERE is_active = 1 AND unit_price IS NULL
  HAVING COUNT(*) > 0`;
