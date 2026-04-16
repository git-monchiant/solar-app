-- Per-lead payment token so /pay URLs don't expose the lead id or amount.
-- Token is regenerated whenever the amount changes.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pay_token')
  ALTER TABLE leads ADD pay_token NVARCHAR(64) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pay_amount')
  ALTER TABLE leads ADD pay_amount DECIMAL(12, 2) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_leads_pay_token')
  CREATE UNIQUE INDEX idx_leads_pay_token ON leads(pay_token) WHERE pay_token IS NOT NULL;
GO
