-- 136: leads.quotation_version — ตรึง lead เก่าให้ใช้ใบเสนอราคาแบบเดิม
--
-- 'v1'  = ระบบเดิม (อัปโหลด PDF เอง → quotation_files) แสดง UI แบบเก่า
-- NULL  = ระบบใหม่ (QuotationBuilder) ← ค่าปกติของ lead ทุกราย ไม่ต้องมี 'v2'
--
-- Backfill: lead ที่ "เคยออกใบเสนอราคาแล้ว" (มี quotation_files) ตรึงเป็น 'v1'
-- เพื่อให้ใบที่ออกไปแล้วยังแก้/ดูด้วย UI เดิมได้ ที่เหลือปล่อย NULL = ระบบใหม่
--
-- ไม่มี USE — deploy tool เลือก db จาก --db=
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'leads' AND COLUMN_NAME = 'quotation_version'
)
BEGIN
  ALTER TABLE leads ADD quotation_version VARCHAR(4) NULL;
END
GO
-- ตรึง lead ที่มีใบเสนอราคาแบบเก่าให้เป็น 'v1' (idempotent: ข้ามรายที่เป็น v1 แล้ว)
UPDATE leads
SET quotation_version = 'v1'
WHERE ISNULL(quotation_version, '') <> 'v1'
  AND quotation_files IS NOT NULL
  AND quotation_files <> ''
  AND quotation_files <> '[]';
