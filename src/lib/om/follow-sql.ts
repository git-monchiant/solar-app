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

import { CLEANING_CYCLE_SQL, isCleaning } from "@/lib/om/entitlement";
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
             WHERE i.house_id = h.id AND i.warranty_start IS NOT NULL) warranty_start
      INTO #due
      FROM om_houses h
      LEFT JOIN om_projects pj ON pj.project_id = h.project_id
     WHERE h.is_om = 1
       AND EXISTS (SELECT 1 FROM om_installations i WHERE i.house_id = h.id)
       AND (
         -- ถึงรอบล้าง (คำนวณสด)
         NOT EXISTS (
             SELECT 1 FROM om_redemptions rd JOIN om_installations i ON i.id = rd.installation_id
              WHERE i.house_id = h.id AND rd.status <> 'void' AND ${isCleaning("rd")}
                AND DATEADD(month, ${CLEANING_CYCLE_SQL}, rd.service_date) > SYSDATETIMEOFFSET())
         -- หรือมีใบงานค้างอยู่ (เช่น งานซ่อมของบ้านที่ยังไม่ถึงรอบล้าง)
         OR EXISTS (SELECT 1 FROM om_bookings b WHERE b.house_id = h.id
                     AND b.status IN (${ACTIVE_SQL}))
         OR EXISTS (SELECT 1 FROM om_bookings b WHERE b.house_id = h.id AND b.status = 'closed'
                     AND DATEDIFF(day, b.updated_at, SYSDATETIMEOFFSET()) <= 90));

    -- ② สรุปการโทรของแต่ละบ้าน (ประวัติอยู่ใน om_booking_history ผูกกับ house_id)
    SELECT bh.house_id,
           COUNT(*) calls,
           SUM(CASE WHEN JSON_VALUE(bh.to_json, '$.outcome') = 'no_answer' THEN 1 ELSE 0 END) no_answer,
           MAX(bh.created_at) last_call_at,
           MAX(bh.next_action_date) next_call
      INTO #call
      FROM om_booking_history bh
     WHERE bh.house_id IS NOT NULL AND bh.[action] = 'call'
     GROUP BY bh.house_id;

    SELECT bh.house_id, JSON_VALUE(bh.to_json, '$.outcome') outcome, u.full_name by_name,
           CONVERT(varchar(33), bh.created_at, 126) at
      INTO #last
      FROM om_booking_history bh
      LEFT JOIN users u ON u.id = bh.actor_user_id
     WHERE bh.house_id IS NOT NULL AND bh.[action] = 'call'
       AND bh.id = (SELECT MAX(b2.id) FROM om_booking_history b2
                     WHERE b2.house_id = bh.house_id AND b2.[action] = 'call');

    -- ③ ใบงานที่เปิดค้างอยู่ของบ้านนั้น
    -- ใบงานล่าสุดของบ้าน (งานค้างมาก่อน ถ้าไม่มีค่อยเอางานที่เพิ่งปิด)
    SELECT b.house_id, b.id booking_id, b.status,
           CONVERT(varchar(33), b.scheduled_at, 126) scheduled_at,
           b.team_id, t.name team_name, st.label_th service_type,
           b.owner_user_id, uo.full_name owner_name,     -- เจ้าของเคส (เฟส 4)
           -- ใบเสนอราคาล่าสุดของใบงาน (แผน 20260924-02 เฟส 2) — มี = งานเส้นเสียเงิน
           oq.id q_id, oq.doc_no q_doc_no, oq.status q_status, oq.contract_total_incl_vat q_total
      INTO #job
      FROM om_bookings b
      LEFT JOIN om_teams t ON t.id = b.team_id
      LEFT JOIN users uo ON uo.id = b.owner_user_id
      LEFT JOIN om_service_type st ON st.id = b.service_type_id
      OUTER APPLY (SELECT TOP 1 q.id, q.doc_no, q.status, q.contract_total_incl_vat
                     FROM quotations q WHERE q.om_booking_id = b.id ORDER BY q.id DESC) oq
     WHERE b.id = (SELECT TOP 1 b2.id FROM om_bookings b2
                    WHERE b2.house_id = b.house_id
                    ORDER BY CASE WHEN b2.status IN (${ACTIVE_SQL})
                                  THEN 0 ELSE 1 END, b2.id DESC);

    -- ④ รวมร่าง + จัดว่าแต่ละหลังอยู่แท็บไหน
    SELECT d.*, ISNULL(c.calls, 0) calls, ISNULL(c.no_answer, 0) no_answer,
           CONVERT(varchar(33), c.last_call_at, 126) last_call_at,
           CONVERT(char(10), c.next_call, 23) next_call,
           l.outcome last_outcome, l.by_name last_by,
           j.booking_id, j.status job_status, j.scheduled_at, j.team_id, j.team_name, j.service_type,
           j.owner_user_id, j.owner_name, j.q_id, j.q_doc_no, j.q_status, j.q_total,
           CASE
             -- ใบงานเดินหน้าแล้วให้ยึดสถานะใบงานเป็นหลัก (ออกจากแท็บติดตาม)
             WHEN j.status IN ('quote','pending','confirmed','progress','checked','closed') THEN j.status
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
      LEFT JOIN #job  j ON j.house_id = d.house_id;
`;

export const OM_FOLLOW_DROP_SQL =
  `DROP TABLE #due; DROP TABLE #call; DROP TABLE #last; DROP TABLE #job; DROP TABLE #x;`;
