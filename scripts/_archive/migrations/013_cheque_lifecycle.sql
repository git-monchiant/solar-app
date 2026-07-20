IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'cheque_bank')
  ALTER TABLE payments ADD cheque_bank NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'cheque_due_date')
  ALTER TABLE payments ADD cheque_due_date DATE NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'cheque_deposited_at')
  ALTER TABLE payments ADD cheque_deposited_at DATETIME2 NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'cheque_status')
  ALTER TABLE payments ADD cheque_status NVARCHAR(20) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'cheque_status_note')
  ALTER TABLE payments ADD cheque_status_note NVARCHAR(500) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'cheque_status_by')
  ALTER TABLE payments ADD cheque_status_by NVARCHAR(100) NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'cheque_status_at')
  ALTER TABLE payments ADD cheque_status_at DATETIME2 NULL;

EXEC(N'
  UPDATE payments
  SET cheque_status = CASE
    WHEN confirmed_at IS NOT NULL THEN ''cleared''
    WHEN cheque_received_at IS NOT NULL THEN ''received''
    ELSE cheque_status
  END
  WHERE payment_method = ''cheque'' AND cheque_status IS NULL;
');
