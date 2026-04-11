-- Add survey_date column for Pre-Survey appointment scheduling
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_date')
BEGIN
  ALTER TABLE leads ADD survey_date DATE NULL;
END
GO
