-- Per-installment actual (scanned/photographed) receipt URL. Lives on the
-- payments row so multi-installment plans can attach a separate signed receipt
-- per งวด. Lead-level receipt_*_actual_url columns from migration 025 remain
-- for backwards-compat (single-installment leads use them via stage-level UI).

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.payments') AND name = 'actual_receipt_url')
BEGIN
  ALTER TABLE dbo.payments ADD actual_receipt_url NVARCHAR(500) NULL;
END
GO
