IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'cheque_received_at')
  ALTER TABLE payments ADD cheque_received_at DATETIME2 NULL;

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('payments') AND name = 'cheque_received_by')
  ALTER TABLE payments ADD cheque_received_by NVARCHAR(100) NULL;
