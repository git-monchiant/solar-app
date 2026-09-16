-- 181: ปรับ SLA ให้ตรงกับตาราง SLA ที่บริษัทกำหนด
--
-- เทียบตารางที่ฝ่ายบริหารให้มา (9 ข้อ) กับค่าที่ตั้งไว้จริงในระบบ พบไม่ตรง 2 จุด
-- ที่แก้ได้ด้วย migration นี้ ส่วนข้อ 6 (ชำระมัดจำ 20%) ยังแก้ไม่ได้เพราะระบบ
-- ไม่ได้บันทึก "วันที่ส่งใบเสนอราคาให้ลูกค้า" ไว้เลย ดูหมายเหตุท้ายไฟล์
--
--   ข้อ 3 Book Survey   สเปก: ภายใน 1 วัน "นับตั้งแต่ Lead เข้ามา"
--                        เดิม: anchor = payment_confirmed (รอลูกค้าจ่ายค่าสำรวจก่อน)
--                        ผลคือ Lead ที่ยังไม่จ่ายไม่มีนาฬิกาเดินเลย 223 ราย
--   ข้อ 9 รับประกัน      สเปก: role = solar
--                        เดิม: owner_role = 'sales' ทั้ง 33 รายการ
--
-- Forward-only และรันซ้ำได้ (ทุกคำสั่งมีเงื่อนไขกันซ้ำในตัว)

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

-- 1) BOOK_SURVEY: จุดเริ่มนับเปลี่ยนเป็นวันที่ Lead เข้ามา
--    config_json เป็นเอกสารกำกับนโยบาย ตัวคำนวณจริงอยู่ใน src/lib/sla-rules.ts
--    (resolveBookSurveyMilestones) ทั้งสองที่ต้องเล่าเรื่องเดียวกัน
UPDATE sla_policies
SET config_json = JSON_MODIFY(
      JSON_MODIFY(config_json, '$.anchor', 'lead_created'),
      '$.note', 'ตาราง SLA ข้อ 3 นับตั้งแต่ Lead เข้ามา'),
    updated_at = SYSDATETIME()
WHERE policy_code = 'BOOK_SURVEY'
  AND is_active = 1
  AND ISJSON(config_json) = 1
  AND JSON_VALUE(config_json, '$.anchor') <> 'lead_created';

-- 2) CLOSE_LEAD (รับประกัน): เป็นงานฝั่ง solar ตามตาราง ข้อ 9
--    แถวที่เปิดอยู่และที่ปิดไปแล้วปรับพร้อมกัน เพื่อให้รายงานย้อนหลังนับทีมถูก
UPDATE lead_sla_instances
SET owner_role = 'solar', updated_at = SYSDATETIME()
WHERE policy_code = 'CLOSE_LEAD' AND (owner_role IS NULL OR owner_role <> 'solar');

-- 3) ล้าง anchor เดิมของ BOOK_SURVEY ที่ยังเปิดค้างอยู่ ให้ syncOperationalSlas
--    คำนวณใหม่จากวันที่ Lead เข้ามาในรอบถัดไป แถวที่ปิดงานไปแล้วไม่แตะ
--    เพราะเป็นประวัติที่เกิดขึ้นจริงภายใต้กติกาเดิม
UPDATE lead_sla_instances
SET context_json = JSON_MODIFY(
      CASE WHEN ISJSON(context_json) = 1 THEN context_json ELSE '{}' END,
      '$.anchorSource', 'lead_created'),
    updated_at = SYSDATETIME()
WHERE policy_code = 'BOOK_SURVEY'
  AND status IN ('active', 'warning', 'critical', 'breached')
  AND (ISJSON(context_json) = 0 OR JSON_VALUE(context_json, '$.anchorSource') <> 'lead_created');

COMMIT TRANSACTION;

-- หมายเหตุ — ข้อ 6 ชำระมัดจำ 20% ยังไม่ได้แก้ในรอบนี้
--
-- สเปกบอก "ติดตามภายใน 7 วัน (เงินสด/บัตร/โอน/เช็ค) หรือ 15 วัน (สินเชื่อ)
-- นับจากวันที่ส่งใบเสนอราคา" ระบบมี policy ที่ตั้งค่าไว้ถูกทั้งคู่แล้วคือ
-- PAYMENT_INSTALLMENT_1 (7 วัน) และ LOAN_PREAPPROVAL (15 วัน) และต่อสายไว้ใน
-- sla-service เรียบร้อย แต่ไม่เคยสร้างงานได้สักรายการ เพราะ anchor ของมันรอ
-- activity ชื่อ 'ส่งใบเสนอราคาให้ลูกค้า' ซึ่งไม่มีโค้ดตรงไหนเขียนเลย
-- (ตรวจแล้ว 0 แถว) ส่วนคอลัมน์ quotations.sent_to_customer_at ก็มีอยู่แต่เป็น
-- NULL ทั้งตาราง ไม่มีโค้ดเขียนเช่นกัน
--
-- แปลว่าเหตุการณ์ "ส่งใบเสนอราคาให้ลูกค้า" ไม่ได้ถูกบันทึกไว้ในระบบเลย ต้องเพิ่ม
-- ปุ่ม/ขั้นตอนให้ผู้ใช้กดบันทึกก่อน SLA ข้อนี้จึงจะเริ่มนับได้ตรงตามสเปก
-- การเดาเอาจากเวลาอนุมัติใบเสนอราคาแทนจะได้ตัวเลขที่ไม่ใช่ข้อตกลงจริง
