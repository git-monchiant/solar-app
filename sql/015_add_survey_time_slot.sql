-- Add survey time slot for appointment scheduling
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_time_slot')
BEGIN
  ALTER TABLE leads ADD survey_time_slot NVARCHAR(20) NULL;
END
GO
