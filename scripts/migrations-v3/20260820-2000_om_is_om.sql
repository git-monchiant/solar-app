-- ผู้ใช้ตัดสิน 20 ส.ค.: unit ตั้งต้นของ O&M = ชีตบ้านเสนา (ชีตปฏิบัติงานล้างแผง)
-- is_om = 1 → unit ที่มาจากชีตตั้งต้น (ลูกค้า O&M จริง) · 0 → บ้านอื่นจาก product_update (prospect/condo/facility)
IF COL_LENGTH('dbo.om_houses', 'is_om') IS NULL
  ALTER TABLE dbo.om_houses ADD is_om BIT NOT NULL DEFAULT 0;
GO
IF COL_LENGTH('dbo.om_houses', 'unit_status') IS NULL
  ALTER TABLE dbo.om_houses ADD unit_status NVARCHAR(20) NULL;  -- occupied | ห้องว่าง | บ้านตัวอย่าง | ตรวจสอบ (จากชีต)
GO
