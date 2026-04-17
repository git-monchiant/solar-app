-- Step 06 Warranty + Step 07 Grid-Tie (ขอขนานไฟ) fields
-- Status values: install → warranty → gridtie → closed

-- Warranty document
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'inverter_sn')
  ALTER TABLE leads ADD inverter_sn NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'warranty_doc_no')
  ALTER TABLE leads ADD warranty_doc_no NVARCHAR(30) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'warranty_start_date')
  ALTER TABLE leads ADD warranty_start_date DATE NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'warranty_end_date')
  ALTER TABLE leads ADD warranty_end_date DATE NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'warranty_issued_at')
  ALTER TABLE leads ADD warranty_issued_at DATETIME2 NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'warranty_doc_url')
  ALTER TABLE leads ADD warranty_doc_url NVARCHAR(500) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'warranty_customer_signature_url')
  ALTER TABLE leads ADD warranty_customer_signature_url NVARCHAR(500) NULL;
GO

-- Grid-tie application (ขอขนานไฟ)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'grid_utility')
  ALTER TABLE leads ADD grid_utility NVARCHAR(10) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'grid_app_no')
  ALTER TABLE leads ADD grid_app_no NVARCHAR(50) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'grid_erc_submitted_date')
  ALTER TABLE leads ADD grid_erc_submitted_date DATE NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'grid_submitted_date')
  ALTER TABLE leads ADD grid_submitted_date DATE NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'grid_inspection_date')
  ALTER TABLE leads ADD grid_inspection_date DATE NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'grid_approved_date')
  ALTER TABLE leads ADD grid_approved_date DATE NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'grid_meter_changed_date')
  ALTER TABLE leads ADD grid_meter_changed_date DATE NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'grid_permit_doc_url')
  ALTER TABLE leads ADD grid_permit_doc_url NVARCHAR(500) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'grid_note')
  ALTER TABLE leads ADD grid_note NVARCHAR(MAX) NULL;
GO
