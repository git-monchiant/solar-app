-- Channel the customer used to pay, captured from the frontend tab when the
-- payment is confirmed. Values: 'qr' | 'link' | 'bank_transfer'. NULL for
-- legacy rows created before this column existed.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'payment_method')
  ALTER TABLE payments ADD payment_method NVARCHAR(20) NULL;
GO
