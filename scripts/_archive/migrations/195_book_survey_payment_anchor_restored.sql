-- 195: BOOK_SURVEY กลับไปเริ่มนับจากหลักฐานการชำระค่าสำรวจ
--
-- migration 181 ย้ายจุดเริ่มนับไปที่ "วันที่ Lead เข้ามา" ตามตาราง SLA ข้อ 3 เพื่อไม่ให้
-- Lead ที่ยังไม่จ่ายหลุดจากเรดาร์ (ตอนนั้นค้างอยู่ 223 ราย) ผลข้างเคียงคือนาฬิกาเดิน
-- คร่อมช่วงที่ทีมขายยังรอลูกค้าตัดสินใจ งาน "ยืนยันวันเวลานัดสำรวจ" จึงขึ้นแดงทั้งที่
-- ทีมทำงานตามปกติ ธุรกิจตัดสินใจให้กลับไปนับจากเงิน: จะนัดสำรวจได้ต้องมีเงินก่อน
--
--   จุดเริ่มนับใหม่: survey_ready_at
--     - ชำระปกติ  Account ยืนยันสลิปค่าจอง (payments API ประทับเวลาให้)
--     - ฟรีค่าสำรวจ Sales เลือกฟรีแล้วกดถัดไป (PATCH payment_confirmed ประทับให้)
--     - นัดสำรวจ   เป็นหลักฐานสำรองสำหรับข้อมูลเก่า/direct booking เท่านั้น
--
-- ตารางนี้เป็นเอกสารกำกับนโยบาย ตัวคำนวณจริงอยู่ที่ resolveBookSurveyMilestones
-- ใน src/lib/sla-rules.ts ทั้งสองที่ต้องเล่าเรื่องเดียวกัน
--
-- Forward-only และรันซ้ำได้

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

IF NOT EXISTS (SELECT 1 FROM dbo.sla_policies WHERE policy_code = 'BOOK_SURVEY' AND version = 6)
  INSERT dbo.sla_policies(
    policy_code, version, name_th, policy_type, target_minutes, warning_minutes, deadline_rule, config_json
  ) VALUES (
    'BOOK_SURVEY', 6, N'ยืนยันวัน เวลา และนัดหมาย Pre-Survey', 'stage', 1440, 240, 'ELAPSED_MINUTES',
    N'{"hours":24,"anchor":"payment_confirmed","freeAnchor":"sales_advance_payment_step","appointmentIsFallbackEvidence":true,"note":"เริ่มนับเมื่อได้รับค่าสำรวจหรือยืนยันฟรีค่าสำรวจ ไม่ใช่วันที่ Lead เข้ามา"}'
  );

UPDATE dbo.sla_policies
SET is_active = CASE WHEN version = 6 THEN 1 ELSE 0 END, updated_at = GETDATE()
WHERE policy_code = 'BOOK_SURVEY'
  AND is_active <> CASE WHEN version = 6 THEN 1 ELSE 0 END;

COMMIT TRANSACTION;

-- ตั้งใจไม่แตะ lead_sla_instances เลย
--
-- reconcileOperationalInstance เขียนทับ started_at / target_at / due_at / warning_at /
-- status / breached_at ของทุกแถวที่ยังเปิดอยู่ ทุกครั้งที่ syncOperationalSlas วิ่ง และ
-- ถ้า anchor กลายเป็น NULL (= ยังไม่จ่ายและยังไม่มีนัด) มันจะตั้งแถวนั้นเป็น 'cancelled'
-- พร้อมเหตุผล anchor_removed ให้เอง งานเบื้องหลัง sla-sweep วิ่งทุก 30 นาทีอยู่แล้ว
-- ข้อมูลเดิมจึงถูกจัดให้ตรงกติกาใหม่ภายในครึ่งชั่วโมงหลัง deploy โดยมีประวัติครบใน
-- lead_sla_events ย้อนดูได้ว่าแถวไหนถูกยกเลิกเพราะอะไร
--
-- หมายเหตุ — แถวที่ปิดงานไปแล้วในช่วงที่ 181 มีผล
--
-- งาน SLA ที่ปิดแล้วเป็นประวัติ engine จะไม่คำนวณใหม่ (ดู reconcileOperationalInstance)
-- ของเก่าก่อน 181 ถูก re-anchor ไปที่ payment_confirmed แล้วโดย migration 177 และ 181
-- แตะเฉพาะแถวที่เปิดอยู่ ประวัติส่วนใหญ่จึงอยู่บนกติกาเดียวกับรอบนี้อยู่แล้ว
--
-- เหลือเฉพาะแถวที่ "ปิดงานระหว่างที่ 181 มีผล" ที่ยังติด anchor lead_created อยู่
-- นับจำนวนได้ด้วย
--
--   SELECT COUNT(*) FROM lead_sla_instances
--   WHERE policy_code = 'BOOK_SURVEY' AND status = 'completed'
--     AND ISJSON(context_json) = 1
--     AND JSON_VALUE(context_json, '$.anchorSource') = 'lead_created';
--
-- ยังไม่แก้ในรอบนี้เพราะการ re-anchor ย้อนหลังจะเปลี่ยนคำตัดสิน "ทัน/ไม่ทันกำหนด"
-- ของงานที่ปิดไปแล้ว ซึ่งเป็นการตัดสินใจของฝ่ายธุรกิจ ไม่ใช่ผลพลอยได้ของการแก้กติกา
-- ถ้าตัดสินใจให้แก้ ทำตามแบบ migration 177 ได้เลย
