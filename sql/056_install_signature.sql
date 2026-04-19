-- Install step: customer signature on job acceptance
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'install_customer_signature_url')
  ALTER TABLE leads ADD install_customer_signature_url NVARCHAR(500) NULL;
GO
