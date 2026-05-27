-- Enlarge the actual-receipt URL columns to NVARCHAR(MAX) so they can hold a
-- JSON array of up to 5 URLs (max ~500 chars × 5 + brackets/quotes > old 500).
--   payments.actual_receipt_url
--   leads.receipt_deposit_actual_url
--   leads.receipt_order_before_actual_url
--   leads.receipt_order_after_actual_url
-- Existing values stay readable: app-side parser treats a non-`[` value as a
-- legacy single URL (i.e. wraps it in a 1-element array).

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.payments') AND name = 'actual_receipt_url')
BEGIN
  ALTER TABLE dbo.payments ALTER COLUMN actual_receipt_url NVARCHAR(MAX) NULL;
END
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'receipt_deposit_actual_url')
BEGIN
  ALTER TABLE dbo.leads ALTER COLUMN receipt_deposit_actual_url NVARCHAR(MAX) NULL;
END
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'receipt_order_before_actual_url')
BEGIN
  ALTER TABLE dbo.leads ALTER COLUMN receipt_order_before_actual_url NVARCHAR(MAX) NULL;
END
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'receipt_order_after_actual_url')
BEGIN
  ALTER TABLE dbo.leads ALTER COLUMN receipt_order_after_actual_url NVARCHAR(MAX) NULL;
END
GO
