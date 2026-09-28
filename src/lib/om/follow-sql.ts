// ขอบเขต "งานบริการ O&M" ในรูป SQL — ที่เดียวที่นิยามว่าบ้านหลังไหนเข้าข่าย และอยู่แท็บไหน
// ★ ฝั่ง server เท่านั้น (ลาก mssql ผ่าน entitlement.ts)
//
// แยกออกมาตอนทำเฟส 6 ของแผน 20260922-01 เพราะหน้าภาพรวมต้องนับเลขชุดเดียวกับหน้ารายการ
// เคยพลาดมาแล้วตอนเฟส 1: เขียนคิวรีนับ badge ขึ้นใหม่แล้วลืม h.is_om = 1 → badge เกินจริง 190 หลัง
// ⇒ กติกา: ใครจะนับงานบริการ ให้ต่อท้ายสคริปต์นี้ อย่าเขียนเกณฑ์ขึ้นใหม่
//
// ใช้งาน — ต้องมี input @max (จำนวนครั้งที่โทรไม่ติดแล้วถือว่าติดต่อไม่ได้ · call.max_attempts):
//   .query(`${OM_FOLLOW_SCOPE_SQL}
//           SELECT bucket, COUNT(*) n FROM #x GROUP BY bucket;
//           ${OM_FOLLOW_DROP_SQL}`)
//
// ตารางชั่วคราวที่สร้างให้: #due (บ้านเข้าข่าย) · #call (สรุปการโทร) · #last (โทรครั้งล่าสุด)
//                          #job (ใบงานล่าสุด) · #x (รวมร่าง + คอลัมน์ bucket)

import { DUE_WASH_SQL, isCleaning } from "@/lib/om/entitlement";
import { ACTIVE_STATUS } from "@/lib/om/booking";

// รายการสถานะงานค้างชุดเดียวกับ booking.ts — เดิมเขียนตายตัวในคิวรี พอเพิ่มสถานะ quote แล้วตกหล่น
const ACTIVE_SQL = ACTIVE_STATUS.map((s) => `'${s}'`).join(",");

export const OM_FOLLOW_SCOPE_SQL = `
    -- ① บ้านที่ถึงรอบล้าง (คำนวณสด) + สิทธิ์คงเหลือ + ล้างล่าสุด + เบอร์
    SELECT h.id house_id, h.house_number, h.project_id,
           ISNULL(pj.name_th, h.project_name) project_name,
           (SELECT ISNULL(SUM(g.qty), 0) FROM om_entitlement_grants g
             JOIN om_installations i ON i.id = g.installation_id
            WHERE i.house_id = h.id AND ${isCleaning("g")})
           - (SELECT COUNT(*) FROM om_redemptions rd
               JOIN om_installations i ON i.id = rd.installation_id
              WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isCleaning("rd")}) balance,
           (SELECT CONVERT(char(10), MAX(rd.service_date), 23) FROM om_redemptions rd
             JOIN om_installations i ON i.id = rd.installation_id
            WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isCleaning("rd")}) last_wash,
           (SELECT COUNT(*) FROM om_redemptions rd
             JOIN om_installations i ON i.id = rd.installation_id
            WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isCleaning("rd")}) wash_count,
           (SELECT TOP 1 c.id FROM om_house_customers hc JOIN om_customers c ON c.id = hc.customer_id
             WHERE hc.house_id = h.id AND hc.is_current = 1
             ORDER BY CASE hc.role WHEN 'owner' THEN 0 ELSE 1 END, hc.id) customer_id,
           (SELECT TOP 1 c.full_name FROM om_house_customers hc JOIN om_customers c ON c.id = hc.customer_id
             WHERE hc.house_id = h.id AND hc.is_current = 1
             ORDER BY CASE hc.role WHEN 'owner' THEN 0 ELSE 1 END, hc.id) customer_name,
           (SELECT TOP 1 p.phone FROM om_house_customers hc
             JOIN om_customer_phones p ON p.customer_id = hc.customer_id
            WHERE hc.house_id = h.id AND hc.is_current = 1 AND p.status <> 'invalid'
            ORDER BY p.is_primary DESC, p.id) phone,
           (SELECT STRING_AGG(CAST(COALESCE(i.rem_size_kwp, i.promo_size_kw) AS varchar(12)), ' + ')
              FROM om_installations i WHERE i.house_id = h.id
               AND COALESCE(i.rem_size_kwp, i.promo_size_kw) IS NOT NULL) kwp_list,
           (SELECT MIN(CONVERT(char(10), i.warranty_start, 23)) FROM om_installations i
             WHERE i.house_id = h.id AND i.warranty_start IS NOT NULL) warranty_start,
           -- วันหมดประกันจากใบรับประกันฝั่งขาย (แผน 20260925-01) — ใช้เลือก "ในประกัน" ให้ก่อนตอนเปิดใบซ่อม
           -- บ้าน REM ไม่มีค่านี้ = NULL → ทีมต้องเลือกเอง (ไม่เดาอายุประกันจากวันเริ่ม)
           (SELECT MAX(CONVERT(char(10), i.sales_warranty_end, 23)) FROM om_installations i
             WHERE i.house_id = h.id AND i.sales_warranty_end IS NOT NULL) warranty_end,
           -- ★ เฟส 6: ถึงรอบล้างไหม (1/0) — เกณฑ์ตัวเดียวกับท่อน A ของ badge (DUE_WASH_SQL)
           --   ใช้ตัดสินว่าใบงานที่ปิดแล้วยังเป็น "งานปัจจุบัน" ของบ้านอยู่ไหม (ดู #x)
           CASE WHEN ${DUE_WASH_SQL} THEN 1 ELSE 0 END due_wash,
           -- ★ เฟส 6: รอบนี้เริ่มเมื่อไร = วันถัดจากล้างล่าสุด (เวลาไทย) — ประวัติโทรก่อนหน้านั้นเป็นของรอบก่อน
           --   เดิมนับตลอดกาล: รอบใหม่ติด "ไม่รับสายครบ" / "ไม่เอา" ของรอบก่อน บ้านตกแท็บผิดทั้งที่ยังไม่มีใครโทรรอบนี้
           (SELECT TODATETIMEOFFSET(DATEADD(day, 1, CAST(MAX(rd.service_date) AS datetime2)), '+07:00')
              FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id
             WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isCleaning("rd")}) cycle_from
      INTO #due
      FROM om_houses h
      LEFT JOIN om_projects pj ON pj.project_id = h.project_id
     WHERE h.is_om = 1
       AND EXISTS (SELECT 1 FROM om_installations i WHERE i.house_id = h.id)
       AND (
         -- ถึงรอบล้าง (คำนวณสด) — ตัวเดียวกับ badge ท่อน A (journey-sql.ts)
         ${DUE_WASH_SQL}
         -- หรือมีใบงานค้างอยู่ (เช่น งานซ่อมของบ้านที่ยังไม่ถึงรอบล้าง)
         OR EXISTS (SELECT 1 FROM om_bookings b WHERE b.house_id = h.id
                     AND b.status IN (${ACTIVE_SQL}))
         OR EXISTS (SELECT 1 FROM om_bookings b WHERE b.house_id = h.id AND b.status = 'closed'
                     AND DATEDIFF(day, b.updated_at, SYSDATETIMEOFFSET()) <= 90));

    -- ② สรุปการโทรของแต่ละบ้าน "ในรอบนี้" (ประวัติอยู่ใน om_booking_history ผูกกับ house_id)
    --   ★ เฟส 6: บ้านที่ถึงรอบใหม่แล้ว นับเฉพาะหลังล้างล่าสุด (#due.cycle_from) — ไทม์ไลน์หน้ารายละเอียดยังเห็นครบ
    --     บ้านที่ยังไม่ถึงรอบ (ปิดงาน/ใบซ่อมค้าง) นับทั้งหมดเหมือนเดิม — การ์ดแท็บปิดงานยังโชว์ "โทรล่าสุด ตกลงนัด" ของรอบนี้
    SELECT bh.house_id,
           COUNT(*) calls,
           SUM(CASE WHEN JSON_VALUE(bh.to_json, '$.outcome') = 'no_answer' THEN 1 ELSE 0 END) no_answer,
           MAX(bh.created_at) last_call_at,
           MAX(bh.next_action_date) next_call
      INTO #call
      FROM om_booking_history bh
      JOIN #due d ON d.house_id = bh.house_id
     WHERE bh.[action] = 'call'
       AND (d.due_wash = 0 OR d.cycle_from IS NULL OR bh.created_at >= d.cycle_from)
     GROUP BY bh.house_id;

    SELECT bh.house_id, JSON_VALUE(bh.to_json, '$.outcome') outcome, u.full_name by_name,
           CONVERT(varchar(33), bh.created_at, 126) at
      INTO #last
      FROM om_booking_history bh
      JOIN #due d ON d.house_id = bh.house_id
      LEFT JOIN users u ON u.id = bh.actor_user_id
     WHERE bh.[action] = 'call'
       AND bh.id = (SELECT MAX(b2.id) FROM om_booking_history b2
                     WHERE b2.house_id = bh.house_id AND b2.[action] = 'call'
                       AND (d.due_wash = 0 OR d.cycle_from IS NULL OR b2.created_at >= d.cycle_from));

    -- ③ ใบงานที่เปิดค้างอยู่ของบ้านนั้น
    -- ใบงานล่าสุดของบ้าน (งานค้างมาก่อน ถ้าไม่มีค่อยเอางานที่เพิ่งปิด)
    SELECT b.house_id, b.id booking_id, b.status,
           CONVERT(varchar(33), b.scheduled_at, 126) scheduled_at,
           CAST(SWITCHOFFSET(b.scheduled_at, '+07:00') AS date) scheduled_day,   -- วันนัดตามเวลาไทย (Today ของ O&M)
           b.team_id, t.name team_name, st.label_th service_type,
           st.code service_code, CAST(st.consumes_quota AS int) consumes_quota,
           b.owner_user_id, uo.full_name owner_name,     -- เจ้าของเคส (เฟส 4)
           -- ใบงานซ่อม (แผน 20260924-02 เฟส 5): ที่มา + ในประกันไหม + อาการ (note ของใบซ่อม)
           b.parent_booking_id, CAST(b.in_warranty AS int) in_warranty, b.note job_note,
           -- ช่างแจ้งพบงานซ่อมในใบตรวจรับงานของใบนี้ + เปิดใบซ่อมไปแล้วหรือยัง (ยกเลิกแล้วถือว่ายัง)
           CAST(jr.repair_needed AS int) repair_needed, jr.repair_detail,
           (SELECT TOP 1 c.id FROM om_bookings c
             WHERE c.parent_booking_id = b.id AND c.status <> 'cancelled' ORDER BY c.id DESC) repair_child_id,
           -- ใบซ่อมที่เปิดจากใบนี้แล้วถูกยกเลิก (ลูกค้าไม่ซ่อม) — ถือว่าตัดสินใจแล้ว ไม่เตือนซ้ำ แต่ยังเปิดใหม่ได้
           rc.id repair_cancel_id, rc.cancelled_reason repair_cancel_reason,
           -- ใบเสนอราคาล่าสุดของใบงาน (แผน 20260924-02 เฟส 2) — มี = งานเส้นเสียเงิน
           oq.id q_id, oq.doc_no q_doc_no, oq.status q_status, oq.contract_total_incl_vat q_total,
           -- การรับเงินของใบเสนอราคา (เฟส 4) — มีใบแล้วเท่านั้น (ไม่มีใบ = NULL)
           CASE WHEN oq.id IS NULL THEN NULL ELSE (SELECT CASE
             WHEN EXISTS (SELECT 1 FROM payments op WHERE op.lead_id = oq.lead_id
                            AND op.slip_field = CONCAT(N'om_quote_', oq.id) AND op.confirmed_at IS NOT NULL) THEN 'paid'
             WHEN EXISTS (SELECT 1 FROM payments op WHERE op.lead_id = oq.lead_id
                            AND op.slip_field = CONCAT(N'om_quote_', oq.id) AND op.confirmed_at IS NULL) THEN 'verifying'
             ELSE 'unpaid' END) END pay_state
      INTO #job
      FROM om_bookings b
      LEFT JOIN om_teams t ON t.id = b.team_id
      LEFT JOIN users uo ON uo.id = b.owner_user_id
      LEFT JOIN om_service_type st ON st.id = b.service_type_id
      LEFT JOIN om_job_report jr ON jr.booking_id = b.id
      OUTER APPLY (SELECT TOP 1 c.id, c.cancelled_reason FROM om_bookings c
                    WHERE c.parent_booking_id = b.id AND c.status = 'cancelled' ORDER BY c.id DESC) rc
      OUTER APPLY (SELECT TOP 1 q.id, q.lead_id, q.doc_no, q.status, q.contract_total_incl_vat
                     FROM quotations q WHERE q.om_booking_id = b.id ORDER BY q.id DESC) oq
     -- ★ ข้ามใบซ่อมที่ถูกยกเลิก (เฟส 5) — ยกเลิกใบซ่อม = ถอยกลับไปสถานะของใบต้นทาง (ปิดงานแล้ว)
     --   ถ้าให้ใบที่ยกเลิกเป็นใบล่าสุด บ้านจะตกไปแท็บติดตามเหมือนต้องโทรนัดล้าง ทั้งที่เพิ่งล้างไป
     --   (ใบล้างที่ยกเลิกยังกลับไปติดตามเหมือนเดิม เพราะล้างไม่ได้เกิดขึ้นจริง)
     WHERE b.id = (SELECT TOP 1 b2.id FROM om_bookings b2
                    WHERE b2.house_id = b.house_id
                      AND NOT (b2.parent_booking_id IS NOT NULL AND b2.status = 'cancelled')
                    ORDER BY CASE WHEN b2.status IN (${ACTIVE_SQL})
                                  THEN 0 ELSE 1 END, b2.id DESC);

    -- ④ รวมร่าง + จัดว่าแต่ละหลังอยู่แท็บไหน
    SELECT d.*, ISNULL(c.calls, 0) calls, ISNULL(c.no_answer, 0) no_answer,
           CONVERT(varchar(33), c.last_call_at, 126) last_call_at,
           CONVERT(char(10), c.next_call, 23) next_call,
           l.outcome last_outcome, l.by_name last_by,
           j.booking_id, j.status job_status, j.scheduled_at, j.scheduled_day, j.team_id, j.team_name, j.service_type,
           j.owner_user_id, j.owner_name, j.q_id, j.q_doc_no, j.q_status, j.q_total, j.pay_state,
           j.service_code, j.consumes_quota, j.parent_booking_id, j.in_warranty, j.job_note,
           j.repair_needed, j.repair_detail, j.repair_child_id, j.repair_cancel_id, j.repair_cancel_reason,
           CASE
             -- ใบงานเดินหน้าแล้วให้ยึดสถานะใบงานเป็นหลัก (ออกจากแท็บติดตาม)
             -- ★ 28 ก.ย. 69 ตัดขั้น/แท็บ "รอปิด" — ใบเก่าที่ค้าง checked อยู่แท็บเข้างาน (ปุ่มปิดงานอยู่ขั้นนั้น) ไม่หายจากจอ
             WHEN j.status = 'checked' THEN 'progress'
             WHEN j.status IN ('quote','payment','pending','confirmed','progress','closed') THEN j.status
             -- ใบซ่อมในประกันที่ยังไม่ได้นัด = งานโทรนัดใหม่ของบ้านนี้ (เฟส 5) — อยู่แท็บติดตามเสมอ
             -- ห้ามให้กติกาด้านล่างตัดสิน: สิทธิ์ล้าง 0 จะตกแท็บสิทธิ์หมด ทั้งที่ซ่อมในประกันไม่ใช้สิทธิ์
             -- และประวัติโทรของรอบล้างก่อน ๆ (นับทั้งบ้าน) จะดันไปติดต่อไม่ได้/ไม่เอา
             -- ลูกค้าไม่ซ่อม = กดยกเลิกใบงานซ่อมในหน้ารายละเอียด
             WHEN j.status = 'follow' AND j.in_warranty = 1   THEN 'follow'
             WHEN l.outcome = 'declined'                      THEN 'declined'
             WHEN d.phone IS NULL OR l.outcome = 'wrong_number' THEN 'unreachable'
             WHEN ISNULL(c.no_answer, 0) >= @max              THEN 'unreachable'
             WHEN d.balance <= 0                              THEN 'noquota'
             ELSE 'follow'
           END bucket
      INTO #x
      FROM #due d
      LEFT JOIN #call c ON c.house_id = d.house_id
      LEFT JOIN #last l ON l.house_id = d.house_id
      -- ★ เฟส 6: ใบที่ปิดแล้วของบ้านที่ถึงรอบล้างใหม่ ไม่ใช่ "งานปัจจุบัน" อีกต่อไป → บ้านเริ่มรอบใหม่แบบไม่มีใบ
      --   (การ์ด "คำนวณสด" · รางเริ่มขั้น 01 · แท็บตามผลโทรรอบนี้) — ตรงกับท่อน A ของ badge ที่นับบ้านนี้เป็น 2100
      --   เดิมใบปิดค้างเป็นใบล่าสุดตลอดกาล บ้านติดแท็บปิดงาน ไม่กลับเข้าคิวโทรอีกเลย (ยืนยันด้วยข้อมูลจริง 28 ก.ย.)
      --   ประวัติของใบเก่ายังอยู่ในไทม์ไลน์หน้ารายละเอียดครบ
      LEFT JOIN #job  j ON j.house_id = d.house_id AND NOT (j.status = 'closed' AND d.due_wash = 1);
`;

export const OM_FOLLOW_DROP_SQL =
  `DROP TABLE #due; DROP TABLE #call; DROP TABLE #last; DROP TABLE #job; DROP TABLE #x;`;
