-- ใบสำรวจ doc number — surfaces on the survey PDF and lets sales reference a
-- specific survey document the same way they reference quotation / warranty.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'survey_doc_no')
  ALTER TABLE dbo.leads ADD survey_doc_no NVARCHAR(30) NULL;
GO
