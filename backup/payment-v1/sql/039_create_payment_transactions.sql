IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('dbo.payment_transactions') AND type = 'U')
BEGIN
  CREATE TABLE payment_transactions (
    id INT IDENTITY(1,1) PRIMARY KEY,
    lead_id INT NOT NULL,
    reference_order NVARCHAR(50) NOT NULL UNIQUE,
    kbank_order_id NVARCHAR(100) NULL,
    kbank_qr_id NVARCHAR(100) NULL,
    kbank_charge_id NVARCHAR(100) NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency NVARCHAR(3) NOT NULL DEFAULT 'THB',
    status NVARCHAR(30) NOT NULL DEFAULT 'pending',
    qr_paint_text NVARCHAR(MAX) NULL,
    qr_image_base64 NVARCHAR(MAX) NULL,
    expires_at DATETIME2 NULL,
    paid_at DATETIME2 NULL,
    failure_code NVARCHAR(256) NULL,
    failure_message NVARCHAR(256) NULL,
    webhook_raw NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (lead_id) REFERENCES leads(id)
  );

  CREATE INDEX idx_payment_transactions_lead_id ON payment_transactions(lead_id);
  CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);
END
GO
