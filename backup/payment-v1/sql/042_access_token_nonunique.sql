-- Allow the same access_token across multiple transaction rows for one lead so
-- we can regenerate an expired QR while keeping the customer's existing link valid.

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_payment_transactions_access_token')
  DROP INDEX idx_payment_transactions_access_token ON payment_transactions;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_payment_transactions_access_token_lookup')
  CREATE INDEX idx_payment_transactions_access_token_lookup ON payment_transactions(access_token) WHERE access_token IS NOT NULL;
GO
