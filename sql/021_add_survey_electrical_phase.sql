-- Survey-side electrical phase (separate from pre-survey customer-claimed phase)
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_electrical_phase')
BEGIN
  ALTER TABLE leads ADD survey_electrical_phase NVARCHAR(20) NULL;
END
GO
