-- Add survey note + extra photos for on-site verification
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_note')
BEGIN
  ALTER TABLE leads ADD survey_note NVARCHAR(MAX) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_photos')
BEGIN
  ALTER TABLE leads ADD survey_photos NVARCHAR(MAX) NULL;
END
GO
