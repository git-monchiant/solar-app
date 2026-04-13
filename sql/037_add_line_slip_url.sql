USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'line_slip_url')
  ALTER TABLE leads ADD line_slip_url NVARCHAR(500) NULL;
GO
