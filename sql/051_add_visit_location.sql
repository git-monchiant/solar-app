USE solardb;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'visit_lat'
)
BEGIN
  ALTER TABLE prospects ADD visit_lat DECIMAL(10,7) NULL, visit_lng DECIMAL(10,7) NULL;
END
GO
