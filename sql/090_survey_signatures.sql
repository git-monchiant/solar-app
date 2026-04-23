-- PDF §7 footer — signatures (surveyor + customer).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_customer_signature_url')
  ALTER TABLE leads ADD survey_customer_signature_url NVARCHAR(500) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_surveyor_signature_url')
  ALTER TABLE leads ADD survey_surveyor_signature_url NVARCHAR(500) NULL;
GO
