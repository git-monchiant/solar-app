USE solardb;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'interest_type'
)
BEGIN
  ALTER TABLE prospects ADD interest_type NVARCHAR(20) NULL; -- 'new' | 'upgrade'
END
GO
