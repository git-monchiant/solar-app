-- Change interested_package_id (single INT) to interested_package_ids (CSV of IDs)
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'interested_package_ids')
BEGIN
  ALTER TABLE leads ADD interested_package_ids NVARCHAR(200) NULL;
END
GO

-- Migrate existing data
UPDATE leads SET interested_package_ids = CAST(interested_package_id AS NVARCHAR)
WHERE interested_package_id IS NOT NULL AND interested_package_ids IS NULL;
GO
