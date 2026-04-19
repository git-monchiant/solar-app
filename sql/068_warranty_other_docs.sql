-- Add warranty_other_docs_url: CSV of URLs for additional warranty documents
-- (misc certs, annexes, photos, etc.)
IF COL_LENGTH('leads', 'warranty_other_docs_url') IS NULL
  ALTER TABLE leads ADD warranty_other_docs_url NVARCHAR(MAX) NULL;
