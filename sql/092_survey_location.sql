-- Survey site geolocation captured on-site by surveyor.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_lat')
  ALTER TABLE leads ADD survey_lat DECIMAL(10, 7) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_lng')
  ALTER TABLE leads ADD survey_lng DECIMAL(10, 7) NULL;
GO
