import { B2B_PENDING_PRICE_SUB } from "./materials";
import { PROJECT_SUB_SQL } from "./project-server";
import { B2B_APPROVAL_SUB } from "./quotation";
import { B2B_PROCURE_PENDING_SUB } from "./execution";
import { VISIT_STEP_SQL } from "./om-server";

// แถวสรุปให้ /api/journey-summary — รูปแบบเดียวกับฝั่งขาย ({journey_step, journey_sub, n})
// รายการ Master ที่ยังใช้งานแต่ Purchase ยังไม่ใส่ราคา · ไม่มีเลย = ไม่คืนแถว (badge ไม่ขึ้น)
export const B2B_JOURNEY_SUMMARY_SQL = `
  SELECT CAST(NULL AS INT) AS journey_step, ${B2B_PENDING_PRICE_SUB} AS journey_sub, COUNT(*) AS n
  FROM b2b_materials
  WHERE is_active = 1 AND unit_price IS NULL
  HAVING COUNT(*) > 0`;

// ใบเสนอราคาที่รอผู้ตรวจสอบแต่ละชั้น → sub 9021–9023 (badge เมนู "อนุมัติ B2B" แยกตามชั้น)
export const B2B_APPROVAL_SUMMARY_SQL = `
  SELECT CAST(NULL AS INT) AS journey_step,
         CASE status WHEN 'pending_review1' THEN ${B2B_APPROVAL_SUB[1]} WHEN 'pending_review2' THEN ${B2B_APPROVAL_SUB[2]} ELSE ${B2B_APPROVAL_SUB[3]} END AS journey_sub,
         COUNT(*) AS n
  FROM b2b_quotations WHERE is_latest = 1 AND status IN ('pending_review1', 'pending_review2', 'pending_review3')
  GROUP BY status`;

// งวดเงินที่แนบหลักฐานแล้วรอบัญชียืนยัน → sub 9030 (badge "รอยืนยันรับเงิน" ของบัญชี · แผน 20261015-07 เฟส 3)
export const B2B_INSTALLMENT_PENDING_SUB = 9030;
export const B2B_INSTALLMENT_SUMMARY_SQL = `
  SELECT CAST(NULL AS INT) AS journey_step, ${B2B_INSTALLMENT_PENDING_SUB} AS journey_sub, COUNT(*) AS n
  FROM b2b_project_installments WHERE status = 'submitted'
  HAVING COUNT(*) > 0`;

// โครงการขั้นขออนุญาต/จัดซื้อที่ Purchase ยังไม่บันทึก "สั่งของครบ" → sub 9040 (badge เมนูจัดซื้อ · เฟส 4)
export const B2B_PROCURE_SUMMARY_SQL = `
  SELECT CAST(NULL AS INT) AS journey_step, ${B2B_PROCURE_PENDING_SUB} AS journey_sub, COUNT(*) AS n
  FROM b2b_projects p
  WHERE p.stage = 3600 AND NOT EXISTS (SELECT 1 FROM b2b_project_milestones m WHERE m.project_id = p.id AND m.kind = 'procured')
  HAVING COUNT(*) > 0`;

// โครงการ B2B ตามขั้น (สาย 3000) + ขั้นย่อย — แผน 20261015-07 · ขั้นย่อยคิดตอนอ่านจึงห่อ subquery ก่อน GROUP BY
export const B2B_PROJECT_SUMMARY_SQL = `
  SELECT x.stage AS journey_step, x.sub AS journey_sub, COUNT(*) AS n
  FROM (SELECT p.stage, ${PROJECT_SUB_SQL("p")} AS sub FROM b2b_projects p) x
  GROUP BY x.stage, x.sub`;

// O&M B2B (สาย 4000 · แผน 20261015-09) — ครั้งเข้างานตามขั้นที่คิดตอนอ่าน · ยังไม่ถึงรอบ/สัญญายกเลิก = ไม่นับ
export const B2B_OM_SUMMARY_SQL = `
  SELECT x.step AS journey_step, CAST(NULL AS INT) AS journey_sub, COUNT(*) AS n
  FROM (SELECT ${VISIT_STEP_SQL("v", "c")} AS step FROM b2b_om_visits v JOIN b2b_om_contracts c ON c.id = v.contract_id) x
  WHERE x.step IS NOT NULL
  GROUP BY x.step`;
