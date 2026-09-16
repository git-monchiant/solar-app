-- ขยายคอลัมน์ที่เก็บช่วงเวลานัด NVARCHAR(100) → NVARCHAR(200)
--
-- ช่วงเวลานัดขยายถึง 17:00 แล้ว (16 ช่วงครึ่งชั่วโมง) ถ้าเลือกครบทุกช่วง
-- ค่าที่เก็บคือ JSON ยาว 129 ตัวอักษร ซึ่งเกิน 100 → ถูกตัดทิ้งเงียบ ๆ
-- กลายเป็น JSON พังที่ parseSlots() อ่านไม่ออก (เดิม 14 ช่วง = 113 ตัวอักษร
-- ก็เกินอยู่แล้ว เพียงแต่ยังไม่มีใครเลือกเกิน 12 ช่วง — ค่ายาวสุดบน prod = 25)
--
-- ต้องรันก่อน deploy โค้ดที่เปลี่ยน sql.NVarChar(100) → NVarChar(200)

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.leads')
             AND name = 'survey_time_slot' AND max_length < 400)
  ALTER TABLE dbo.leads ALTER COLUMN survey_time_slot NVARCHAR(200) NULL;

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.leads')
             AND name = 'install_time_slot' AND max_length < 400)
  ALTER TABLE dbo.leads ALTER COLUMN install_time_slot NVARCHAR(200) NULL;

IF EXISTS (SELECT 1 FROM sys.columns
           WHERE object_id = OBJECT_ID('dbo.calendar_blocks')
             AND name = 'time_slot' AND max_length < 400)
  ALTER TABLE dbo.calendar_blocks ALTER COLUMN time_slot NVARCHAR(200) NULL;
