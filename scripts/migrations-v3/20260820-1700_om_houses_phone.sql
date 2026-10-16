-- เพิ่มคอลัมน์ phone ให้ om_houses (backfill จากบ้านเสนา · เบอร์ติดต่อ 85%)
-- product_update ไม่มีเบอร์ · แหล่งเบอร์ = บ้านเสนา + line_users(ผูกทีหลัง)
-- 1 คนหลายเบอร์ในอนาคต → แตกเป็น om_customer_phones (ยังไม่ทำในรอบนี้)
IF COL_LENGTH('dbo.om_houses', 'phone') IS NULL
  ALTER TABLE dbo.om_houses ADD phone NVARCHAR(20) NULL;
GO

IF COL_LENGTH('dbo.om_houses', 'phone_source') IS NULL
  ALTER TABLE dbo.om_houses ADD phone_source NVARCHAR(20) NULL;  -- 'bansena' | 'line_users' | 'manual'
GO
