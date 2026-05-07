-- Add team to calendar_blocks — admin-created "ทีมไปทำอย่างอื่น" blocks need
-- to scope to one team so they only hide that team's slots in CalendarPicker.
-- Values: 'survey' | 'install' | NULL (NULL = applies to both teams).
USE solardb;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('calendar_blocks') AND name = 'team'
)
BEGIN
  ALTER TABLE calendar_blocks ADD team NVARCHAR(20) NULL;
END
GO

PRINT 'calendar_blocks.team added';
GO
