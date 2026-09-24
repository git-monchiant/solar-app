// คิวรีนับงาน O&M ต่อ journey code — ฝั่ง server เท่านั้น (ลาก mssql ผ่าน entitlement.ts)
// ค่าคงที่/ทะเบียนเลขอยู่ที่ journey.ts ซึ่ง client import ได้

import { DUE_WASH_SQL } from "./entitlement";
import { ACTIVE_STATUS } from "./booking";
import { OM_FOLLOW_STEP, OM_PAY_SUB, OM_QUOTE_SUB_BY_STATUS, OM_STEP_BY_STATUS, OM_SUB_BY_STATUS } from "./journey";

const quote = (xs: readonly string[]) => xs.map((s) => `'${s}'`).join(",");

const PAY_SUB_SQL = `(SELECT CASE
             WHEN EXISTS (SELECT 1 FROM payments op WHERE op.lead_id = oq.lead_id
                            AND op.slip_field = CONCAT(N'om_quote_', oq.id) AND op.confirmed_at IS NOT NULL) THEN ${OM_PAY_SUB.paid}
             WHEN EXISTS (SELECT 1 FROM payments op WHERE op.lead_id = oq.lead_id
                            AND op.slip_field = CONCAT(N'om_quote_', oq.id) AND op.confirmed_at IS NULL) THEN ${OM_PAY_SUB.verifying}
             ELSE ${OM_PAY_SUB.unpaid} END)`;

const caseSql = (col: string, map: Record<string, number>, fallback?: number) =>
  `CASE ${col} ${Object.entries(map)
    .map(([s, code]) => `WHEN '${s}' THEN ${code}`)
    .join(" ")}${fallback != null ? ` ELSE ${fallback}` : ""} END`;

/**
 * แถวสรุปฝั่ง O&M — รูปแบบเดียวกับที่ /api/journey-summary คืนให้ฝั่งขาย
 * ({journey_step, journey_sub, n}) เพื่อให้ countForMenuItem/countForModule ใช้ได้เลย
 * โดยไม่ต้องแก้โค้ดนับแม้แต่บรรทัดเดียว
 *
 * ★ สองท่อน เพราะ "ติดตาม" ไม่ได้อยู่บนใบงาน
 *   A = บ้านถึงรอบล้างที่ยังไม่มีใครแตะ (คำนวณสดจาก om_houses)
 *   B = ใบงานทั้งหมด (follow ที่โทรแล้วแต่ยังไม่ได้วันนัด ก็เป็น 2100 เหมือนกัน)
 *
 * ★ ท่อน A ตัดบ้านที่มีใบงานค้างอยู่แล้วออก — ผู้ใช้เคาะ 23 ก.ย. เลือกแบบ (ก) "นับครั้งเดียว"
 *   บ้านที่นัดไปแล้วไม่ใช่งานโทรค้างอีกต่อไป มันย้ายไปขั้นถัดไปแล้ว
 *   ⇒ การ์ดโมดูลตอบ "ค้างกี่ชิ้น" ได้ถูก ไม่บวมเพราะนับซ้ำ
 *   และตัดที่ท่อน A ไม่ใช่ท่อน B เพราะใบงานจริงชนะการคำนวณสดเสมอ
 *   (ท่อน B ยังนับ follow ไว้ ไม่งั้นงานที่โทรแล้วจะหายไปทั้งสองท่อน)
 *
 * ★ ท่อน B คืน sub ด้วย (24 ก.ย. 69) — นัดหมาย 2400 แยก 2410 รอยืนยันนัด / 2420 นัดแล้ว
 *   เมนูเช็คลิสต์นับเฉพาะ 2420 (ยังไม่ยืนยันนัด = ยังไม่ถึงคิวช่าง)
 *
 * ★ ท่อน A ใช้ derived table + GROUP BY แทน COUNT(*) เปล่า ๆ เพื่อไม่ให้คืนแถว n = 0
 *   ตอนไม่มีบ้านค้าง — ให้เหมือนฝั่งขายที่ GROUP BY แล้วขั้นว่างหายไปเอง
 *
 * ★★ เงื่อนไขท่อน A ต้องตรงกับ #due ใน /api/om/follow เป๊ะ ไม่งั้น badge โกหก
 *   โดยเฉพาะ h.is_om = 1 — ตกไปตอนแรกทำให้ badge เกินจริง 190 หลัง (บ้านที่ถูกกันออกจาก O&M
 *   แต่ยังเข้าเกณฑ์ถึงรอบล้าง) วัดจริง 23 ก.ย.: ไม่กรอง 1,847 · กรองแล้ว 1,657
 *   แก้ตรงนี้ทีไร ต้องไปเทียบกับ #due ทุกครั้ง (กติกา ui-rules: badge = จำนวนที่กดเข้าไปเห็นจริง)
 */
export const OM_JOURNEY_SUMMARY_SQL = `
  SELECT journey_step, journey_sub, COUNT(*) AS n FROM (
    SELECT ${OM_FOLLOW_STEP} AS journey_step, 0 AS journey_sub
      FROM om_houses h
     WHERE h.is_om = 1
       AND EXISTS (SELECT 1 FROM om_installations i WHERE i.house_id = h.id)
       AND ${DUE_WASH_SQL}
       AND NOT EXISTS (SELECT 1 FROM om_bookings b
                        WHERE b.house_id = h.id AND b.status IN (${quote(ACTIVE_STATUS)}))
  ) a GROUP BY journey_step, journey_sub
  UNION ALL
  SELECT journey_step, journey_sub, COUNT(*) AS n FROM (
    SELECT ${caseSql("b.status", OM_STEP_BY_STATUS)} AS journey_step,
           CASE WHEN b.status = 'quote' THEN ${caseSql("oq.status", OM_QUOTE_SUB_BY_STATUS, 2210)}
                -- ชำระเงิน (เฟส 4): อ่านจากแถว payments ของใบล่าสุด slip_field = om_quote_<id>
                WHEN b.status = 'payment' THEN ${PAY_SUB_SQL}
                ELSE ${caseSql("b.status", OM_SUB_BY_STATUS, 0)} END AS journey_sub
      FROM om_bookings b
      -- ใบเสนอราคาล่าสุดของใบงาน (เฟส 2 แผน 20260924-02) — ใช้แยกขั้นย่อยของเสนอราคา 2210–2250
      OUTER APPLY (SELECT TOP 1 q.id, q.lead_id, q.status FROM quotations q
                    WHERE q.om_booking_id = b.id ORDER BY q.id DESC) oq
     WHERE b.status IN (${quote(Object.keys(OM_STEP_BY_STATUS))})
  ) j GROUP BY journey_step, journey_sub`;
