-- Additional PDF §5 photo slot — electrical tab (opened MDB showing breakers).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_photo_mdb_url')
  ALTER TABLE leads ADD survey_photo_mdb_url NVARCHAR(500) NULL;
GO
