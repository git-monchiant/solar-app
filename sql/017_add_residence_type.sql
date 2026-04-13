-- Add residence type for pre-survey (e.g. detached, townhouse, townhome)
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'residence_type')
BEGIN
  ALTER TABLE leads ADD residence_type NVARCHAR(30) NULL;
END
GO
