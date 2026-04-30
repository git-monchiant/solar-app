-- Customer email — captured from web form submissions (Gmail registration
-- import) and lets sales reach customers without a phone reply.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'email')
  ALTER TABLE dbo.leads ADD email NVARCHAR(200) NULL;
GO
