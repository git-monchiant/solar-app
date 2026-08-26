/**
 * SLA ของขั้นตอนที่ "ผ่านไปแล้ว" ของ lead หนึ่งราย — สรุปเป็น JSON ก้อนเดียว
 *
 * การ์ด Lead แสดง SLA ที่กำลังเดินอยู่แค่ตัวเดียว (ตัวที่ใกล้กำหนดสุด) แถบ
 * pipeline จึงเล่าได้แค่ว่า "ตอนนี้" ช้าอยู่ตรงไหน ขั้นตอนก่อนหน้าที่เคยเกิน
 * กำหนดแล้วปิดงานไปหายไปทั้งหมด ทั้งที่เป็นข้อมูลที่หัวหน้าต้องเห็นเวลาไล่ดู
 * ว่างานรายนี้ช้าสะสมมาจากขั้นไหนบ้าง
 *
 * เกณฑ์ "เกินกำหนด" ใช้ breached_at ไม่ใช่ status เพราะแถวที่ปิดงานช้าจะถูก
 * เปลี่ยน status เป็น 'completed' แต่ sla-service ยังคง breached_at ไว้เป็น
 * หลักฐาน (ดู completeSlaByMilestone / reconcile) แถวที่ยกเลิกหรือถูกแทนที่
 * ไม่นับ เพราะนาฬิกาที่เดินค้างไว้ไม่ใช่ความช้าของงานจริง
 *
 * ต้องมี `leads l` อยู่ใน FROM ก่อนหน้า และคู่กับคอลัมน์
 * {@link LATE_SLA_STAGES_COLUMN} ในลิสต์ SELECT
 */
export const LATE_SLA_STAGES_APPLY = `
      OUTER APPLY (
        SELECT (
          SELECT si.policy_code AS policy_code,
                 COUNT(*) AS late_count,
                 MAX(DATEDIFF(MINUTE, si.due_at, COALESCE(si.completed_at, GETDATE()))) AS overdue_minutes,
                 MAX(CASE WHEN si.completed_at IS NULL THEN 1 ELSE 0 END) AS still_open
          FROM lead_sla_instances si
          WHERE si.lead_id = l.id
            AND si.superseded_at IS NULL
            AND si.breached_at IS NOT NULL
            AND si.status IN ('active','warning','critical','breached','completed')
          GROUP BY si.policy_code
          FOR JSON PATH
        ) AS stages_json
      ) sla_late`;

/** อ่านฝั่ง UI ด้วย parseLateSlaStages() ใน src/lib/sla-display.ts */
export const LATE_SLA_STAGES_COLUMN = `sla_late.stages_json as sla_late_stages`;
