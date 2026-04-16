-- Description text to show on the payment-request document (ใบแจ้งโอนเงิน)
-- for the current pay_token + pay_amount.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pay_description')
  ALTER TABLE leads ADD pay_description NVARCHAR(200) NULL;
GO
