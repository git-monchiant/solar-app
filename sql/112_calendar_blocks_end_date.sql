-- Multi-day blocks ("ลาพักร้อน 3 วัน", "อบรมทีม จ-พฤ", ฯลฯ).
-- end_date NULL = single-day block on block_date.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.calendar_blocks') AND name = 'end_date')
BEGIN
  ALTER TABLE dbo.calendar_blocks ADD end_date DATE NULL;
END
GO
