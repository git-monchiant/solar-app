-- แกะตัวเลขออกจากชื่อโปรโมชัน — ชื่อโปรฯ ของ REM มีทั้งขนาดระบบและอายุสัญญา O&M อยู่ในนั้น
--   "Solar Roof 3.0 kw."                          → 3.0 kW
--   "ระบบบ้าน ZEH และ Solar Rooftop 3 kw.+O&M 2 ปี" → 3 kW · O&M 2 ปี
--   "ฟรี Solar Roof 1.28 kw."                      → 1.28 kW
-- ทำไมมีค่า: บ้าน O&M 1,032 หลังยังไม่รู้อินเวอร์เตอร์/ขนาดระบบเลย ตัวนี้เติมให้ได้ส่วนหนึ่ง
-- ★ เก็บแยกคอลัมน์ ไม่ไปทับ om_installations.rem_size_kwp — คนละที่มา ต้องเทียบกันได้

IF COL_LENGTH('dbo.om_rem_promotions','solar_kw') IS NULL
  ALTER TABLE dbo.om_rem_promotions ADD solar_kw DECIMAL(8,2) NULL;
GO
IF COL_LENGTH('dbo.om_rem_promotions','om_years') IS NULL
  ALTER TABLE dbo.om_rem_promotions ADD om_years INT NULL;
GO
-- โปรฯ ที่ถูกยกเลิก (ชื่อมีคำว่า "ยกเลิก") — ยังเก็บไว้ แต่ต้องไม่นับเป็นของแถมที่ได้จริง
IF COL_LENGTH('dbo.om_rem_promotions','is_cancelled') IS NULL
  ALTER TABLE dbo.om_rem_promotions ADD is_cancelled BIT NOT NULL CONSTRAINT DF_om_rem_promo_cancel DEFAULT 0;
GO
