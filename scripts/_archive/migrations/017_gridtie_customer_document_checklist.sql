-- Step 07: submitted document bundle and customer-document checklist
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('leads') AND name = 'grid_application_doc_url'
)
  ALTER TABLE leads ADD grid_application_doc_url NVARCHAR(500) NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('leads') AND name = 'grid_applicant_type'
)
  ALTER TABLE leads ADD grid_applicant_type NVARCHAR(20) NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('leads') AND name = 'grid_document_checklist'
)
  ALTER TABLE leads ADD grid_document_checklist NVARCHAR(MAX) NULL;
GO
