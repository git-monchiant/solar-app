-- Store the Ref1 string embedded in the Bill Payment QR at confirm time.
-- Format: <promptpay_ref1>L<lead_id>S<step_no> (e.g. "87UXL123S4").
-- Null for Credit Transfer payments (no ref in that QR mode) and for any
-- legacy rows created before this column existed.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'ref1')
  ALTER TABLE payments ADD ref1 NVARCHAR(50) NULL;
GO
