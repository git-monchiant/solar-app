-- Per-user signature URL — surfaces in profile so reps can pre-save their
-- signature once and reuse it on quotation/install confirmation flows.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.users') AND name = 'signature_url')
  ALTER TABLE dbo.users ADD signature_url NVARCHAR(500) NULL;
GO
