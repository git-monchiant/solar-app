-- Snapshot Solar Sup signature separately from the final Sale Sup signature.
-- Idempotent migration for SQL Server.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.quotations')
    AND name = 'solar_approver_name_snapshot'
)
  ALTER TABLE dbo.quotations ADD solar_approver_name_snapshot NVARCHAR(150) NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.quotations')
    AND name = 'solar_approver_title_snapshot'
)
  ALTER TABLE dbo.quotations ADD solar_approver_title_snapshot NVARCHAR(100) NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.quotations')
    AND name = 'solar_approver_signature_url_snapshot'
)
  ALTER TABLE dbo.quotations ADD solar_approver_signature_url_snapshot NVARCHAR(500) NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.quotations')
    AND name = 'solar_approver_signature_data_snapshot'
)
  ALTER TABLE dbo.quotations ADD solar_approver_signature_data_snapshot VARBINARY(MAX) NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.quotations')
    AND name = 'solar_approver_signature_mime_snapshot'
)
  ALTER TABLE dbo.quotations ADD solar_approver_signature_mime_snapshot NVARCHAR(100) NULL;
