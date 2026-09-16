-- 183: SLA ข้อ 6 ชำระมัดจำ 20% นับจากวันที่เสนอราคาทั้งสองแบบ ตามที่ผู้ใช้กำหนด
--
--   PAYMENT_INSTALLMENT_1  เงินสด/บัตรเครดิต/โอน/เช็ค  ติดตามภายใน 7 วัน
--   LOAN_PREAPPROVAL       สินเชื่อ                    ติดตามภายใน 15 วัน
--
-- เดิมแบบแรกรอ activity 'ส่งใบเสนอราคาให้ลูกค้า' ที่ไม่มีโค้ดเขียน แบบหลังรอสำรวจเสร็จ
-- และเอกสารสินเชื่อครบ ทั้งสอง policy จึงไม่เคยสร้างงานได้สักรายการ
-- ตัวคำนวณจริงอยู่ใน src/lib/sla-service.ts (anchor = proposalAt) ไฟล์นี้แก้
-- config_json ซึ่งเป็นเอกสารกำกับนโยบายให้เล่าเรื่องเดียวกัน
-- ยังไม่มีงานของสอง policy นี้ในตาราง งานเบื้องหลังจะสร้างให้ในรอบถัดไป
-- Forward-only และรันซ้ำได้

SET NOCOUNT ON;
SET XACT_ABORT ON;

UPDATE dbo.sla_policies
SET config_json = JSON_MODIFY(config_json, '$.anchor', 'proposal_sent'),
    updated_at = GETDATE()
WHERE policy_code IN ('PAYMENT_INSTALLMENT_1', 'LOAN_PREAPPROVAL')
  AND is_active = 1
  AND ISJSON(config_json) = 1
  AND ISNULL(JSON_VALUE(config_json, '$.anchor'), '') <> 'proposal_sent';
