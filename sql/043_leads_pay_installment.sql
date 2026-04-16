-- Installment label for payment request (e.g. "งวด 1/2", "งวด 2/2", "ค่ามัดจำ")
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'pay_installment')
  ALTER TABLE leads ADD pay_installment NVARCHAR(50) NULL;
GO
