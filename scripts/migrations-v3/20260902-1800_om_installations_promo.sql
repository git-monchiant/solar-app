-- ขนาดระบบ/อายุสัญญา ที่ได้จาก "โปรโมชันตอนขาย" ของ REM
-- ★ เก็บแยกคอลัมน์ ไม่เขียนทับ rem_size_kwp เพราะคนละที่มา:
--     rem_size_kwp   = จากไฟล์ที่นำเข้ามาตอนแรก
--     promo_size_kw  = แกะจากชื่อโปรฯ ของ REM ("Solar Roof 3.0 kw." → 3.0)
--   ตรวจแล้วสองแหล่งตรงกัน 969/969 คู่ (ต่างเกิน 0.3 kW = 0) แต่ยังต้องแยกไว้ให้ตรวจย้อนได้
-- เติมให้บ้านที่ยังไม่รู้ขนาดได้ 99 หลัง (เหลือไม่รู้ 282 จาก 381)

IF COL_LENGTH('dbo.om_installations','promo_size_kw') IS NULL
  ALTER TABLE dbo.om_installations ADD promo_size_kw DECIMAL(8,2) NULL;
GO
IF COL_LENGTH('dbo.om_installations','promo_om_years') IS NULL
  ALTER TABLE dbo.om_installations ADD promo_om_years INT NULL;
GO
-- สัญญาที่โปรฯ นี้มาจาก — อาจไม่ใช่ rem_contract_id ถ้าจับคู่ด้วยโครงการ+บ้านเลขที่
IF COL_LENGTH('dbo.om_installations','promo_contract_id') IS NULL
  ALTER TABLE dbo.om_installations ADD promo_contract_id NVARCHAR(80) COLLATE Latin1_General_BIN2 NULL;
GO
-- ข้อความต้นทางจาก REM — เก็บไว้ให้เห็นว่าเลข kW มาจากประโยคไหน
IF COL_LENGTH('dbo.om_installations','promo_name') IS NULL
  ALTER TABLE dbo.om_installations ADD promo_name NVARCHAR(400) NULL;
GO
