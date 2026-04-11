-- Add ac_units column for per-BTU air conditioner counts
-- Format: "9000:2,12000:1" (btu:count pairs)
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'ac_units')
BEGIN
  ALTER TABLE leads ADD ac_units NVARCHAR(200) NULL;
END
GO
