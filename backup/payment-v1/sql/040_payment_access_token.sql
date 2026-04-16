IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payment_transactions') AND name = 'access_token')
  ALTER TABLE payment_transactions ADD access_token NVARCHAR(64) NULL;
GO

-- Backfill existing rows with random tokens (using NEWID for each)
UPDATE payment_transactions
SET access_token = REPLACE(CAST(NEWID() AS NVARCHAR(36)), '-', '') + REPLACE(CAST(NEWID() AS NVARCHAR(36)), '-', '')
WHERE access_token IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_payment_transactions_access_token')
  CREATE UNIQUE INDEX idx_payment_transactions_access_token ON payment_transactions(access_token) WHERE access_token IS NOT NULL;
GO
