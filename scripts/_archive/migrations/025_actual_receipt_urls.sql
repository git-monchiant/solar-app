-- Add nullable URL columns to store the scanned/photographed signed paper receipt
-- (ใบเสร็จตัวจริง) uploaded by accounting after issuing the system-generated PDF.
-- One column per receipt stage:
--   receipt_deposit_actual_url     → matches stage="deposit"     (PreSurveyStep)
--   receipt_order_before_actual_url → matches stage="order_before" (OrderStep)
--   receipt_order_after_actual_url  → matches stage="order_after"  (InstallStep)

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'receipt_deposit_actual_url')
BEGIN
  ALTER TABLE dbo.leads ADD receipt_deposit_actual_url NVARCHAR(500) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'receipt_order_before_actual_url')
BEGIN
  ALTER TABLE dbo.leads ADD receipt_order_before_actual_url NVARCHAR(500) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'receipt_order_after_actual_url')
BEGIN
  ALTER TABLE dbo.leads ADD receipt_order_after_actual_url NVARCHAR(500) NULL;
END
GO
