USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'line_id')
  ALTER TABLE leads ADD line_id NVARCHAR(100) NULL;
GO
