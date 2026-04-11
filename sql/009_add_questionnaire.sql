-- Add questionnaire JSON column to leads for Pre-Survey form answers
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'questionnaire')
BEGIN
  ALTER TABLE leads ADD questionnaire NVARCHAR(MAX) NULL;
END
GO
