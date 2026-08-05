-- 137: quotations.package_id → nullable — ใบเสนอราคาไม่จำเป็นต้องมี Package หลัก
--
-- ลูกค้าบางรายซื้อเฉพาะ "รายการเพิ่มเติม" (ส่วนเสริม) โดยไม่มีแพ็กเกจหลัก
-- จึงปล่อยให้ package_id เป็น NULL ได้ (FK_quotations_package ยอม NULL อยู่แล้ว)
-- name/price snapshot ยังคง NOT NULL — กรณีไม่มี package จะเก็บ ''/0
--
-- idempotent: ทำเฉพาะตอนที่ยังเป็น NOT NULL · ไม่มี USE (deploy tool เลือก db)
IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'quotations' AND COLUMN_NAME = 'package_id' AND IS_NULLABLE = 'NO'
)
BEGIN
  ALTER TABLE quotations ALTER COLUMN package_id INT NULL;
END
