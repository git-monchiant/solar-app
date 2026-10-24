-- พิกัด GPS ของบ้าน — REM ส่งมาในสัญญาโอน (om_rem_transfers.latitude/longitude)
-- ช่างใช้นำทางไปบ้านลูกค้า · เก็บที่ระดับบ้านเพื่อ query เร็ว (ไม่ต้อง join สัญญาทุกครั้ง)
IF COL_LENGTH('dbo.om_houses','latitude') IS NULL
  ALTER TABLE dbo.om_houses ADD latitude NVARCHAR(40) NULL, longitude NVARCHAR(40) NULL;
GO
