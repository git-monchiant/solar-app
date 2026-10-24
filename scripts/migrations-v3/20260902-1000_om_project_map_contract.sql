-- เพิ่ม match_type = 'contract' — จับคู่โครงการด้วย "เลขสัญญา" ไม่ใช่ชื่อ
-- ที่มา: REM ให้เลขสัญญามาทุกใบ (8,186 ใบ ไม่ซ้ำเลยสักใบ) และเลขสัญญาบอกรหัสโครงการในตัว
--        แต่ฝั่งขาย (leads) ไม่มีคอลัมน์เลขสัญญา → ใช้ "ตัวคน" เป็นสะพาน
--        leads.id_card_number / phone  ↔  REM owners[].citizenID / phoneNo1  → เลขสัญญา → โครงการ
--        แล้วยืนยันซ้ำด้วยบ้านเลขที่ภายในโครงการเดียวกัน (กติกาที่ผู้ใช้เคาะ 1 ก.ย.)
-- ระดับความน่าเชื่อ: contract > exact > similar   (contract = มีหลักฐานระดับหลัง ไม่ใช่แค่ชื่อพ้อง)

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_om_project_map_type')
  ALTER TABLE dbo.om_project_map DROP CONSTRAINT CK_om_project_map_type;
GO
ALTER TABLE dbo.om_project_map WITH NOCHECK
  ADD CONSTRAINT CK_om_project_map_type
  CHECK (match_type IN ('exact','similar','manual','outside','contract'));
GO
-- หลักฐานที่ใช้ตัดสิน เก็บไว้ตรวจย้อนได้ว่าเชื่อจากอะไร
IF COL_LENGTH('dbo.om_project_map','evidence') IS NULL
  ALTER TABLE dbo.om_project_map ADD evidence NVARCHAR(400) NULL;
GO
-- ธงว่ามีข้อขัดแย้งรอคนตัดสิน (ชื่อบอกอย่าง สัญญาบอกอีกอย่าง)
IF COL_LENGTH('dbo.om_project_map','conflict') IS NULL
  ALTER TABLE dbo.om_project_map ADD conflict NVARCHAR(300) NULL;
GO
