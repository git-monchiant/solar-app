-- Rename pay_*, slip_url → pre_*, pre_slip_url for consistent pre-survey process prefix.
-- The pay_* columns are used only for the pre-survey deposit request, so they belong with other pre_* fields.

-- Drop index on pay_token first (sp_rename fails while it references the column)
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('leads') AND name = 'idx_leads_pay_token')
  DROP INDEX idx_leads_pay_token ON leads;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pay_token')
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pre_pay_token')
  EXEC sp_rename 'leads.pay_token', 'pre_pay_token', 'COLUMN';
GO

-- Recreate the index with new name
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('leads') AND name = 'idx_leads_pre_pay_token')
  CREATE NONCLUSTERED INDEX idx_leads_pre_pay_token ON leads(pre_pay_token);
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pay_amount')
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pre_pay_amount')
  EXEC sp_rename 'leads.pay_amount', 'pre_pay_amount', 'COLUMN';
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pay_description')
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pre_pay_description')
  EXEC sp_rename 'leads.pay_description', 'pre_pay_description', 'COLUMN';
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pay_installment')
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pre_pay_installment')
  EXEC sp_rename 'leads.pay_installment', 'pre_pay_installment', 'COLUMN';
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'slip_url')
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pre_slip_url')
  EXEC sp_rename 'leads.slip_url', 'pre_slip_url', 'COLUMN';
GO
