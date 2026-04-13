-- Survey-side battery confirmation (separate from pre_wants_battery)
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_wants_battery')
BEGIN
  ALTER TABLE leads ADD survey_wants_battery NVARCHAR(20) NULL;
END
GO
