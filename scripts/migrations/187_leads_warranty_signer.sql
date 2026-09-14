-- Freeze the warranty certificate's signer per lead.
--
-- The cert has no stored PDF — /api/warranty/[id] re-renders it from the DB on
-- every open, and the LINE message sends a link, not a file. So changing the
-- company-wide designated signer used to rewrite every certificate already in
-- customers' hands. This column pins the signer at issue time.
--
-- NOT a duplicate of leads.warranty_issued_by: that stays the audit trail of
-- who *clicked* "ออกเอกสาร"; this is whose name and signature the cert prints.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'warranty_signer_user_id')
  ALTER TABLE dbo.leads ADD warranty_signer_user_id INT NULL;
GO

PRINT 'leads.warranty_signer_user_id added';
GO
