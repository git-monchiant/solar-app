import { SLA_POLICY_ORDER } from "@/lib/sla-display";

/**
 * ลำดับขั้นตอนของ policy เป็นตัวเลขใน SQL — มาจาก SLA_POLICY_ORDER ที่เดียว
 * ใช้ตัดสินว่างานไหน "อยู่ขั้นหลังสุด" แทนการดูจากเวลาที่บันทึก เพราะเวลาที่บันทึก
 * บอกแค่ว่าแถวถูกเขียนเมื่อไร ไม่ได้บอกว่างานนั้นอยู่ช่วงไหนของกระบวนการ
 */
export const slaPolicyRankSql = (a: string) =>
  `CASE ${a}.policy_code ${SLA_POLICY_ORDER.map((code, i) => `WHEN '${code}' THEN ${i}`).join(" ")} ELSE -1 END`;

/**
 * งานประเมิน Grade ของ Lead เก่าที่ Grade ถูกตั้งไว้ก่อนมีระบบบันทึกประวัติ
 *
 * migration เติมประวัติ Grade ให้ Lead กลุ่มนี้ (reason = grade_sla_backfill_v1)
 * โดยประทับเวลา "ตอนรัน migration" engine จึงได้งานที่เริ่มและเสร็จในวินาทีเดียวกัน
 * ในวันที่รัน ซึ่งไม่ใช่เหตุการณ์จริง (ตรวจเจอ 33 ราย เช่น Lead ที่ติดตั้งเสร็จไป
 * ตั้งแต่มิถุนายน กลับขึ้นว่า "ประเมิน Grade เสร็จวันนี้ ใช้เวลา 1 นาที")
 * หน้า Timeline ซ่อนงานพวกนี้อยู่แล้ว (shouldShowSlaTimelineItem) ที่นี่ใช้กฎเดียวกัน
 */
export const slaLegacyGradeAssessmentSql = (a: string) => `(${a}.policy_code = 'ELECTRICITY_ASSESSMENT'
          AND (SELECT TOP 1 gh.reason FROM lead_grade_history gh
               WHERE gh.lead_id = ${a}.lead_id
               ORDER BY gh.changed_at DESC, gh.id DESC) = 'grade_sla_backfill_v1')`;

/**
 * สถานะของงาน SLA ที่ยังเปิดอยู่ ณ วินาทีที่อ่าน — คิดจากนาฬิกาอย่างเดียว
 *
 * active / warning / critical / breached ไม่ได้เกิดจากการกระทำของใคร เป็นแค่การ
 * เทียบเวลาปัจจุบันกับ due_at / warning_at จึงคำนวณตอน SELECT ได้เลย ไม่ต้องมีงาน
 * ไล่ UPDATE ลงตาราง เดิมหน้า Today / Pipeline / Dashboard ต้องเรียก
 * refreshOpenSlaStates() เขียนฐานข้อมูลทุกครั้งที่เปิดหน้า การอ่านจึงมีผลข้างเคียง
 * และสถานะของ Lead ที่ไม่มีใครเปิดดูก็ค้างอยู่ค่าเดิม
 *
 * refreshOpenSlaStates() ในงานเบื้องหลังใช้นิยามเดียวกันนี้บันทึกค่าลงตาราง
 * เพื่อเก็บประวัติเหตุการณ์ ตัวเลขบนจอกับค่าที่บันทึกจึงไม่มีทางต่างกัน
 *
 * @param a alias ของตาราง lead_sla_instances ในคำสั่งนั้น เช่น "si"
 */
export const slaTimeStatusSql = (a: string) => `CASE
          WHEN GETDATE() > ${a}.due_at THEN 'breached'
          WHEN DATEDIFF(MINUTE, GETDATE(), ${a}.due_at) <= 30 THEN 'critical'
          WHEN ${a}.warning_at IS NOT NULL AND GETDATE() >= ${a}.warning_at THEN 'warning'
          ELSE 'active'
        END`;

/** สถานะที่ใช้แสดงผล — งานที่ยังเปิดคิดสดจากนาฬิกา งานที่ปิด/ยกเลิกแล้วใช้ค่าที่บันทึก */
export const slaLiveStatusSql = (a: string) =>
  `CASE WHEN ${a}.status IN ('active','warning','critical','breached') THEN ${slaTimeStatusSql(a)} ELSE ${a}.status END`;

/**
 * เวลาที่เกินกำหนด — ใช้ค่าที่บันทึกไว้ถ้ามี ไม่มีก็คิดเอง (ครบกำหนดแล้วยังไม่เสร็จ
 * หรือเสร็จหลังครบกำหนด) งานที่ยังไม่เคยผ่านงานเบื้องหลังจึงไม่ถูกนับว่าทันเวลา
 * ทั้งที่จริงเลยกำหนดไปแล้ว งานที่ยกเลิก/ถูกแทนที่ไม่นับ
 */
export const slaLiveBreachedAtSql = (a: string) => `COALESCE(${a}.breached_at,
          CASE WHEN ${a}.status IN ('active','warning','critical','breached','completed')
                AND COALESCE(${a}.completed_at, GETDATE()) > ${a}.due_at
               THEN ${a}.due_at END)`;

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
            AND ${slaLiveBreachedAtSql("si")} IS NOT NULL
            AND si.status IN ('active','warning','critical','breached','completed')
          GROUP BY si.policy_code
          FOR JSON PATH
        ) AS stages_json
      ) sla_late`;

/** อ่านฝั่ง UI ด้วย parseLateSlaStages() ใน src/lib/sla-display.ts */
export const LATE_SLA_STAGES_COLUMN = `sla_late.stages_json as sla_late_stages`;

/**
 * SLA ที่ "ปิดงานไปแล้ว" ล่าสุดของ lead หนึ่งราย — ใช้ตอนที่ไม่มีงานค้างอยู่เลย
 *
 * เดิมการ์ดผูกกล่อง SLA ไว้กับงานที่ยังเปิดอยู่เท่านั้น พอทีมทำครบทุกขั้นแล้ว
 * กล่องก็หายไปทั้งใบ เหลือแค่ชิป "ไม่มีงาน SLA" ซึ่งอ่านแล้วเหมือนระบบลืม lead
 * รายนั้น ทั้งที่ความจริงคือทำเสร็จหมดแล้ว งานที่ทำทันกำหนดจึงต้องขึ้นกล่อง
 * เหมือนกัน แค่เป็นสีเขียว (เทียบกับ Timeline & SLA ในหน้า Lead ที่ติดป้าย
 * "เสร็จใน SLA" ให้อยู่แล้ว)
 *
 * เอาเฉพาะแถวที่ปิดงานจริง (completed) ไม่เอา cancelled/superseded เพราะสองอัน
 * นั้นคือ "ยกเลิกนาฬิกา" ไม่ใช่ "ทำงานเสร็จ" — เอามาโชว์เขียวจะโกหกคนอ่าน
 * breached_at ติดมาด้วยเพื่อให้ฝั่ง UI แยกได้ว่าเสร็จทันกำหนดหรือเสร็จช้า
 *
 * ต้องมี `leads l` อยู่ใน FROM ก่อนหน้า และคู่กับ {@link SLA_DONE_COLUMNS}
 */
export const SLA_DONE_APPLY = `
      OUTER APPLY (
        SELECT TOP 1 si.policy_code, si.task_name, si.started_at, si.due_at,
               si.completed_at, ${slaLiveBreachedAtSql("si")} AS breached_at, si.owner_role,
               (SELECT full_name FROM users WHERE id = si.owner_user_id) AS owner_name
        FROM lead_sla_instances si
        WHERE si.lead_id = l.id
          AND si.status = 'completed'
          AND si.completed_at IS NOT NULL
          AND si.superseded_at IS NULL
          AND NOT ${slaLegacyGradeAssessmentSql("si")}
        -- "ล่าสุด" คือขั้นหลังสุดของกระบวนการ ไม่ใช่แถวที่เพิ่งถูกเขียน — เดิมเรียงตาม
        -- completed_at ทำให้ Lead ที่อยู่ขั้นใบรับประกันโชว์งานประเมิน Grade แทน
        ORDER BY ${slaPolicyRankSql("si")} DESC, si.completed_at DESC, si.id DESC
      ) sla_done`;

/** คู่กับ {@link SLA_DONE_APPLY} — การ์ดใช้เมื่อ sla_status ว่าง */
export const SLA_DONE_COLUMNS = `sla_done.policy_code as sla_done_policy_code,
             sla_done.task_name as sla_done_task_name,
             sla_done.started_at as sla_done_started_at,
             sla_done.due_at as sla_done_due_at,
             sla_done.completed_at as sla_done_completed_at,
             sla_done.breached_at as sla_done_breached_at,
             sla_done.owner_role as sla_done_owner_role,
             sla_done.owner_name as sla_done_owner_name`;
