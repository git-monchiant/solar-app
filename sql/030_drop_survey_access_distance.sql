USE solardb;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_access_distance')
  ALTER TABLE leads DROP COLUMN survey_access_distance;
GO
