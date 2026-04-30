-- time_slot now stores a JSON array of hourly slot codes (e.g.
-- ["09:00","10:00","13:00"]) so a survey can occupy multiple hours.
-- A full 8-slot day serializes to 65 chars, well over the old 20-char cap.
-- Legacy single-string values ("morning"/"afternoon"/"am"/"pm") still parse
-- via fallback in the client code.
IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'leads' AND COLUMN_NAME = 'survey_time_slot' AND CHARACTER_MAXIMUM_LENGTH < 100
)
  ALTER TABLE dbo.leads ALTER COLUMN survey_time_slot NVARCHAR(100) NULL;
GO

IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'leads' AND COLUMN_NAME = 'install_time_slot' AND CHARACTER_MAXIMUM_LENGTH < 100
)
  ALTER TABLE dbo.leads ALTER COLUMN install_time_slot NVARCHAR(100) NULL;
GO

IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'calendar_blocks' AND COLUMN_NAME = 'time_slot' AND CHARACTER_MAXIMUM_LENGTH < 100
)
  ALTER TABLE dbo.calendar_blocks ALTER COLUMN time_slot NVARCHAR(100) NULL;
GO
