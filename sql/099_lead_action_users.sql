-- Track which user closed/confirmed each lifecycle step. Surfaces in PDF/receipt
-- generators so the signature stamped on a document belongs to the person who
-- actually completed the action (not whoever happens to be viewing).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'survey_completed_by')
  ALTER TABLE dbo.leads ADD survey_completed_by INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'quote_sent_by')
  ALTER TABLE dbo.leads ADD quote_sent_by INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'payment_confirmed_by')
  ALTER TABLE dbo.leads ADD payment_confirmed_by INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'order_before_paid_by')
  ALTER TABLE dbo.leads ADD order_before_paid_by INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'order_after_paid_by')
  ALTER TABLE dbo.leads ADD order_after_paid_by INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'install_completed_by')
  ALTER TABLE dbo.leads ADD install_completed_by INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'warranty_issued_by')
  ALTER TABLE dbo.leads ADD warranty_issued_by INT NULL;
GO
