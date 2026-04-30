-- Per-payment number used as Ref2 in PromptPay QR Bill Payment.
-- Format: <leadId:5d>P<yearYY:2d><runningPerYear:5d>  e.g. 00123P2600001
-- Pre-created when user opens the payment screen so QR can carry a stable
-- transaction reference. Slip confirmation later UPDATEs the same row.
IF NOT EXISTS (
  SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.payments') AND name = 'payment_no'
)
BEGIN
  ALTER TABLE dbo.payments ADD payment_no NVARCHAR(20) NULL;
  CREATE INDEX ix_payments_payment_no ON dbo.payments(payment_no);
END
GO

-- Year -> last running number. MERGE on this row to allocate the next
-- running per year atomically (avoids race when multiple payments are
-- created concurrently).
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'payment_no_counter')
BEGIN
  CREATE TABLE dbo.payment_no_counter (
    year_yy INT PRIMARY KEY,    -- 2-digit AD year, e.g. 26 for 2026
    last_no INT NOT NULL
  );
END
GO

-- A pending intent leaves confirmed_at NULL until the slip is confirmed.
-- The original schema defaulted confirmed_at to GETDATE() and was NOT NULL,
-- which would mark every pre-created row as "confirmed" immediately.
DECLARE @df NVARCHAR(200) = (
  SELECT dc.name FROM sys.default_constraints dc
  JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
  WHERE c.object_id = OBJECT_ID('dbo.payments') AND c.name = 'confirmed_at'
);
IF @df IS NOT NULL EXEC('ALTER TABLE dbo.payments DROP CONSTRAINT ' + @df);
GO

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.payments') AND name = 'confirmed_at' AND is_nullable = 0
)
BEGIN
  ALTER TABLE dbo.payments ALTER COLUMN confirmed_at DATETIME2 NULL;
END
GO
