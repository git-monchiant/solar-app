-- Add confirmed flag on slip_files so we know which slip has been acknowledged by Sales
-- without joining the payments table.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('slip_files') AND name = 'confirmed')
  ALTER TABLE slip_files ADD confirmed BIT NOT NULL CONSTRAINT DF_slip_files_confirmed DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('slip_files') AND name = 'confirmed_at')
  ALTER TABLE slip_files ADD confirmed_at DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('slip_files') AND name = 'confirmed_by')
  ALTER TABLE slip_files ADD confirmed_by INT NULL;
GO
