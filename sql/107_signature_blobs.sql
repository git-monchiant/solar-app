-- Move signatures off disk into the DB. Each pad keeps its existing _url
-- column (now points at the API endpoint that streams the BLOB) so all the
-- <img src={...}> sites keep working unchanged.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.users') AND name = 'signature_data')
  ALTER TABLE dbo.users ADD signature_data VARBINARY(MAX) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.users') AND name = 'signature_mime')
  ALTER TABLE dbo.users ADD signature_mime NVARCHAR(50) NULL;
GO

-- Customer-side signatures collected per lead (survey, install, warranty).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'survey_customer_signature_data')
  ALTER TABLE dbo.leads ADD survey_customer_signature_data VARBINARY(MAX) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'survey_customer_signature_mime')
  ALTER TABLE dbo.leads ADD survey_customer_signature_mime NVARCHAR(50) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'install_customer_signature_data')
  ALTER TABLE dbo.leads ADD install_customer_signature_data VARBINARY(MAX) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'install_customer_signature_mime')
  ALTER TABLE dbo.leads ADD install_customer_signature_mime NVARCHAR(50) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'warranty_customer_signature_data')
  ALTER TABLE dbo.leads ADD warranty_customer_signature_data VARBINARY(MAX) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'warranty_customer_signature_mime')
  ALTER TABLE dbo.leads ADD warranty_customer_signature_mime NVARCHAR(50) NULL;
GO

-- Test data — old _url values point at /api/upload disk paths that will not
-- be regenerated under the new flow. Clear them so stale references do not
-- show broken images.
UPDATE dbo.users SET signature_url = NULL WHERE signature_url IS NOT NULL;
UPDATE dbo.leads SET
  survey_customer_signature_url = NULL,
  install_customer_signature_url = NULL,
  warranty_customer_signature_url = NULL;
GO
