-- ปิดงาน "ค่าขัดกัน" ได้จากหน้าจอ (ผู้ใช้เคาะ 9 ก.ย. 69)
-- om_field_sources.confidence = 'probable' คือค่าที่ไฟล์ต้นทางให้มาไม่ตรงกับของเดิม
-- ระบบไม่เขียนทับ เก็บไว้ให้คนตัดสิน — ต้องมีที่บันทึกว่าตัดสินไปแล้วหรือยัง ตัดสินว่าอะไร
IF COL_LENGTH('om_field_sources', 'resolved_at') IS NULL
  ALTER TABLE om_field_sources ADD
    resolved_at     DATETIMEOFFSET NULL,
    resolved_action VARCHAR(12) COLLATE Latin1_General_BIN2 NULL,  -- keep = ยึดของเดิม · apply = ยึดค่าใหม่
    resolved_by     INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_om_field_sources_open')
  CREATE INDEX IX_om_field_sources_open ON om_field_sources (confidence, resolved_at) INCLUDE (house_id);
GO
