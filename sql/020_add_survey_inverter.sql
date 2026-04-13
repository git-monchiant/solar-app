-- Add inverter selection captured during survey
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_inverter')
BEGIN
  ALTER TABLE leads ADD survey_inverter NVARCHAR(100) NULL;
END
GO
