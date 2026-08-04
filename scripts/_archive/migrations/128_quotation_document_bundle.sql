-- Immutable quotation document snapshots, approval certification and PDF artifacts.
-- Idempotent migration for SQL Server.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.quotations') AND name = 'document_inputs_json')
  ALTER TABLE dbo.quotations ADD document_inputs_json NVARCHAR(MAX) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.quotations') AND name = 'document_snapshot_json')
  ALTER TABLE dbo.quotations ADD document_snapshot_json NVARCHAR(MAX) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.quotations') AND name = 'financial_snapshot_json')
  ALTER TABLE dbo.quotations ADD financial_snapshot_json NVARCHAR(MAX) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.quotations') AND name = 'document_snapshot_at')
  ALTER TABLE dbo.quotations ADD document_snapshot_at DATETIME2 NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.quotations') AND name = 'approval_certified_by')
  ALTER TABLE dbo.quotations ADD approval_certified_by INT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.quotations') AND name = 'approval_certified_at')
  ALTER TABLE dbo.quotations ADD approval_certified_at DATETIME2 NULL;

IF OBJECT_ID('dbo.quotation_document_artifacts', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quotation_document_artifacts (
    id INT IDENTITY(1,1) PRIMARY KEY,
    quotation_id INT NOT NULL,
    document_type NVARCHAR(30) NOT NULL CONSTRAINT DF_qda_type DEFAULT 'approved_bundle',
    pdf_data VARBINARY(MAX) NOT NULL,
    file_hash CHAR(64) NOT NULL,
    page_count INT NOT NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_qda_created DEFAULT GETDATE(),
    CONSTRAINT FK_qda_quotation FOREIGN KEY (quotation_id) REFERENCES dbo.quotations(id) ON DELETE CASCADE,
    CONSTRAINT UQ_qda_quotation_type UNIQUE (quotation_id, document_type),
    CONSTRAINT CK_qda_page_count CHECK (page_count = 17)
  );
END;

