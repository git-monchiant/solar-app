-- เพิ่ม packages.term_set_profile — เลือกชุดเงื่อนไขใบเสนอราคาได้ตรง ๆ ที่แพ็กเกจ
--
-- เดิม getQuotationTermsProfile() เดาจาก is_upgrade / ชื่อขึ้นต้น "Scale up:" /
-- มีแบตอย่างเดียว ซึ่งพลาดกับแพ็กเกจที่ไม่มีอุปกรณ์หลัก (เช่น "งานเพิ่มตู้
-- คอนซูมเมอร์ยูนิต") ที่ตกไปเข้าชุด "ติดตั้งใหม่ทั้งระบบ" แล้วพ่วงข้อความ
-- รับประกันงานติดตั้ง 2 ปี กับหัวข้อ O&M มาด้วย
--
-- backfill ที่นี่ "ลอกผลของกติกาเดิมเป๊ะ" ทุกแถว → ไม่มีใบเสนอราคาใบไหน
-- เปลี่ยนเนื้อหาเพราะ migration นี้ การแก้ให้ถูกเป็นการตัดสินใจของแอดมิน
-- ทีหลังผ่านหน้า Package Management
--
-- โค้ดยัง fallback ไปใช้กติกาเดิมเมื่อค่าเป็น NULL แถวใหม่ที่ยังไม่ตั้งค่าจึงไม่พัง
-- Forward-only และรันซ้ำได้

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
