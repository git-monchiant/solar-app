-- ตามเก็บ migration ของ v2 ที่ solardb_v3 ตกหล่น: packages.term_set_profile
-- ต้นฉบับ: scripts/_archive/migrations/20260828-1305_add_packages_term_set_profile.sql (รันบน solardb / solardb_dev แล้ว)
--
-- เจอ 24 ก.ย. 69 ตอนทดสอบเฟส 3 แผน docs/plan/20260924-02: ส่งอนุมัติใบเสนอราคาฝั่งขายบน v3 พังทั้งหมด
--   "Invalid column name 'term_set_profile'" — buildQuotationDocumentSnapshot / PDF ใบร่าง SELECT คอลัมน์นี้
--   (โค้ดมาทาง merge main → v3 แต่ migration ของ v2 ไม่ได้ถูกรันบนฐาน v3 ตาม)
-- ผู้ใช้เคาะให้รัน 24 ก.ย. 69
--
-- เนื้อหาเหมือนต้นฉบับทุกบรรทัด — รันซ้ำได้ ฐานที่ copy มาจาก prod (มีคอลัมน์แล้ว) จะไม่มีอะไรเปลี่ยน
-- backfill ลอกผลของกติกาเดิมในโค้ด (getQuotationTermsProfile) เป๊ะ ⇒ ไม่มีใบเสนอราคาใบไหนเปลี่ยนเนื้อหา
--
-- ★ อีกคอลัมน์ที่ prod มีแต่ v3 ไม่มี: lead_data.payment_interest — ไม่ได้ใส่ตรงนี้ เพราะไม่มีโค้ดส่วนไหนใช้
--   และไม่มี migration ต้นฉบับ (น่าจะเพิ่มมือบน prod) ถ้าวันหนึ่งโค้ดต้องใช้ ค่อยเพิ่ม nvarchar(100) NULL ตาม prod

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH('packages', 'term_set_profile') IS NULL
BEGIN
  ALTER TABLE packages ADD term_set_profile VARCHAR(20) NULL;
END
GO

-- ใช้ ISNULL ให้ตรงกับฝั่ง JS ที่อ่านค่า null เป็น false
-- (ชื่อ: ตัดช่องว่างทั้งหมดทิ้งก่อนเทียบ เพื่อให้เท่ากับ regex /^scale\s*up\s*:/i)
UPDATE packages
SET term_set_profile =
  CASE
    WHEN ISNULL(is_upgrade, 0) = 1 THEN 'additional_install'
    WHEN LOWER(REPLACE(REPLACE(REPLACE(ISNULL(name, ''), ' ', ''), CHAR(9), ''), CHAR(160), ''))
         LIKE 'scaleup:%' THEN 'additional_install'
    WHEN ISNULL(has_battery, 0) = 1
     AND ISNULL(has_panel, 0) = 0
     AND ISNULL(has_inverter, 0) = 0 THEN 'additional_install'
    ELSE 'full_install'
  END
WHERE term_set_profile IS NULL;
GO

-- กันค่าแปลกปลอมหลุดเข้ามาจาก API
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_packages_term_set_profile')
BEGIN
  ALTER TABLE packages ADD CONSTRAINT CK_packages_term_set_profile
    CHECK (term_set_profile IS NULL OR term_set_profile IN ('full_install', 'additional_install'));
END
GO
