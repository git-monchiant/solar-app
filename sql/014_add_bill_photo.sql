-- Add electricity bill photo URL for pre-survey
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'bill_photo_url')
BEGIN
  ALTER TABLE leads ADD bill_photo_url NVARCHAR(500) NULL;
END
GO
