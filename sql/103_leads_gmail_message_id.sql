-- Track which Gmail message a lead was imported from so re-syncs don't dupe.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'gmail_message_id')
  ALTER TABLE dbo.leads ADD gmail_message_id NVARCHAR(64) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'ix_leads_gmail_message_id' AND object_id = OBJECT_ID('dbo.leads'))
  CREATE UNIQUE INDEX ix_leads_gmail_message_id ON dbo.leads(gmail_message_id) WHERE gmail_message_id IS NOT NULL;
GO
