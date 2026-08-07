-- 140: ขยาย CHECK constraint ของ quotation_items.source_type ให้รองรับ tree editor
--
-- ของเดิม CK_qi_source อนุญาตแค่ package / addon / custom ทำให้ตัวแก้ไขใบเสนอราคา
-- แบบ tree (หลาย package + งานเพิ่ม + บรรทัดรายละเอียด) บันทึกไม่ได้ ขึ้น 500
--   The INSERT statement conflicted with the CHECK constraint "CK_qi_source"
--
-- taxonomy ที่ใช้จริงตอนนี้:
--   package               หัวข้อ/รายละเอียดของ package หลัก
--   addon_package         หัวข้อ package เสริม (คิดเงินจาก line_total)
--   addon_package_detail  บรรทัดรายละเอียดใต้ package เสริม
--   custom_group          หัวข้อ "งานเพิ่ม" ที่พิมพ์เอง
--   custom_detail         บรรทัดรายละเอียดใต้งานเพิ่ม
--   custom, addon         ของเดิม (legacy) — เก็บไว้เพื่อไม่ให้ข้อมูลเก่าพัง
--
-- idempotent: ลบ constraint เดิมก่อน (ถ้ามี) แล้วสร้างใหม่ด้วยชื่อเดิม

IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_qi_source' AND parent_object_id = OBJECT_ID('quotation_items'))
  ALTER TABLE quotation_items DROP CONSTRAINT CK_qi_source;

ALTER TABLE quotation_items WITH NOCHECK ADD CONSTRAINT CK_qi_source CHECK (
  source_type IN (
    'package',
    'addon_package',
    'addon_package_detail',
    'custom_group',
    'custom_detail',
    'custom',
    'addon'
  )
);
