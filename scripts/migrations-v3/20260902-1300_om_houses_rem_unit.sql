-- ผูกบ้านกับ unit ของ REM ด้วยคอลัมน์ของตัวเอง
-- ทำไมไม่ใช้ src_unit_id: ตรวจ 2 ก.ย. พบว่าเก็บรหัสของระบบนำเข้าเก่า ('4450', '2822')
--   ไม่ใช่รูปแบบของ REM ('70103-00077') — เอามาปนกันจะแยกไม่ออกว่ารหัสไหนของใคร

IF COL_LENGTH('dbo.om_houses','rem_unit_id') IS NULL
  ALTER TABLE dbo.om_houses ADD rem_unit_id NVARCHAR(60) COLLATE Latin1_General_BIN2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_om_houses_rem_unit')
CREATE INDEX IX_om_houses_rem_unit ON dbo.om_houses(rem_unit_id) WHERE rem_unit_id IS NOT NULL;
GO
