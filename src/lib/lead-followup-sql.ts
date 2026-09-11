/**
 * กติกา "เลยนัดแล้ว" ของทั้งระบบ อยู่ที่นี่ที่เดียว
 *
 * เดิมนิพจน์นี้ฝังอยู่ใน /api/today ที่เดียว ส่วน /api/leads ไม่ส่งค่านี้มา
 * LeadCard จึงตกไปใช้สูตรสำรองฝั่ง browser ที่เทียบกับ "เที่ยงวัน" ผลคือหน้า
 * Pipeline ติดป้าย "เลยนัดแล้ว" ให้ Lead ที่นัดวันนี้ทุกวันหลังเที่ยง
 * (ตรวจเมื่อ 26 ส.ค. 16:14 น. โดนไป 28 ราย) และยังติดป้ายให้ Lead ที่ยกเลิก
 * ไปแล้วอีก 110 ราย ทั้งที่หน้า Today ตัดออกให้ตั้งแต่ต้น
 */

/**
 * เงื่อนไข 3 ข้อที่ต้องครบถึงจะนับว่าเลยนัด
 *   1. เลย "วัน" ที่นัดจริง ๆ — นัดวันนี้ยังไม่ถือว่าเลย ไม่ว่าจะกี่โมง
 *   2. status ไม่ใช่ install/lost — ปิดงานหรือยกเลิกแล้วไม่มีอะไรให้ตาม
 *   3. ยังไม่ได้ตามตั้งแต่วันนัดเป็นต้นมา — ตามไปแล้วก็ไม่ถือว่าค้าง
 *
 * @param lastFollowUpDate นิพจน์ SQL ที่ให้ "วันตามล่าสุด" ของ lead นั้น
 *   เช่น `act.last_followup_date` (/api/today) หรือ `fu.last_followup_date`
 *   จาก {@link LAST_FOLLOW_UP_APPLY}
 */
export const followUpOverdueSql = (lastFollowUpDate: string) => `CAST(CASE
    WHEN l.next_follow_up IS NOT NULL
     AND l.next_follow_up < CAST(GETDATE() AS DATE)
     AND l.status NOT IN ('install', 'lost')
     AND (${lastFollowUpDate} IS NULL OR ${lastFollowUpDate} < l.next_follow_up)
    THEN 1 ELSE 0
  END AS BIT)`;

/**
 * ให้ `fu.last_followup_date` สำหรับ query ที่ไม่มี `act` join แบบ /api/today
 * ต้องมี `leads l` อยู่ใน FROM ก่อนหน้า และนิยามต้องตรงกับ act.last_followup_date
 * ไม่งั้นสองหน้าจะให้คำตอบต่างกันอีก
 */
export const LAST_FOLLOW_UP_APPLY = `
      OUTER APPLY (
        SELECT MAX(COALESCE(a.followup_date, CAST(a.created_at AS DATE))) AS last_followup_date
        FROM lead_activities a
        WHERE a.lead_id = l.id
          AND a.activity_type IN ('call','visit','line','other','follow_up','loan_followup')
      ) fu`;
