-- payments.created_at: timestamp when the row was inserted (pending or
-- confirmed). Without it we can't tell when a placeholder was seeded vs. when
-- the customer actually started the payment flow — confirmed_at only fires on
-- admin verify.
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.payments') AND name = 'created_at'
)
BEGIN
  ALTER TABLE dbo.payments ADD created_at DATETIME2 NOT NULL CONSTRAINT df_payments_created_at DEFAULT GETDATE();
END
GO

-- Backfill existing rows: best-effort guess from confirmed_at, otherwise leave
-- the GETDATE() default. Confirmed rows are usually created and confirmed in
-- the same flow, so confirmed_at is the most accurate fallback we have.
UPDATE dbo.payments
SET created_at = confirmed_at
WHERE confirmed_at IS NOT NULL
  AND created_at > confirmed_at;
GO
