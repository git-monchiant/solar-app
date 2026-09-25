-- สิทธิ์ที่มีวันหมดอายุ ตัดส่วนที่ไม่ได้ใช้ทิ้งจริงเมื่อเลย valid_to (แผน docs/plan/20260924-02 เฟส 4 · งานเก็บตก)
--
-- ★ ทำไมเขียนแถวติดลบ ไม่แก้สูตรยอดคงเหลือ:
--   ยอดสิทธิ์คำนวณหลายที่ (วิว om_entitlement_balance + follow-sql + houses + houses/groups + dashboard)
--   และ om_entitlement_grants เป็น ledger แบบเพิ่มอย่างเดียวที่รับค่าติดลบอยู่แล้ว (manual_adjust)
--   ⇒ ตอนหมดอายุ เขียนแถว source = 'expire' qty ติดลบเท่าส่วนที่ไม่ได้ใช้ ทุกที่ที่รวมยอดถูกตามโดยไม่ต้องแก้สักที่
--      และประวัติสิทธิ์ของบ้านเห็นเลยว่า "หมดอายุ −1" เพราะอะไร
-- ★ expire_of = grant ตัวที่หมดอายุ · unique กันตัดซ้ำ (งานตัดวิ่งจากหลายคำขอพร้อมกันได้)
--   แถว expire ที่ qty = 0 = ตรวจแล้วใช้ครบก่อนหมดอายุ (เป็นเครื่องหมายว่าตรวจแล้ว)
-- ★ ตอนเขียน migration นี้ยังไม่มี grant ไหนมี valid_to (ตรวจ 24 ก.ย. 69) — ไม่กระทบยอดของบ้านไหนที่มีอยู่
--   มีแค่ grant ที่เฟส 4 เติมจากการซื้อสัญญา 12 เดือนที่ตั้ง valid_to

IF COL_LENGTH('dbo.om_entitlement_grants', 'expire_of') IS NULL
  ALTER TABLE dbo.om_entitlement_grants ADD expire_of INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_om_grants_expire_of' AND object_id = OBJECT_ID('dbo.om_entitlement_grants'))
  CREATE UNIQUE INDEX UX_om_grants_expire_of ON dbo.om_entitlement_grants(expire_of) WHERE expire_of IS NOT NULL;
GO
