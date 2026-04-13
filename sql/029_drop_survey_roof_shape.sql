USE solardb;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_roof_shape')
  ALTER TABLE leads DROP COLUMN survey_roof_shape;
GO
