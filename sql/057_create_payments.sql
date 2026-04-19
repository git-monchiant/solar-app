-- Transaction log of confirmed payments. One row per payment item.
-- Written ONLY on "ยืนยันรับชำระเงิน" click; read only for file recovery / audit.
-- Lead detail load does NOT join this table.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'payments')
BEGIN
  CREATE TABLE payments (
    id             INT IDENTITY(1,1) PRIMARY KEY,
    lead_id        INT            NOT NULL,
    step_no        INT            NOT NULL,          -- 0=register/pre, 3=order_before, 4=order_after
    slip_field     NVARCHAR(50)   NOT NULL,          -- pre_slip_url | order_before_slip | order_after_slip
    doc_no         NVARCHAR(50)   NULL,              -- snapshot of booking_number at confirm time
    amount         DECIMAL(12,2)  NOT NULL,
    description    NVARCHAR(200)  NULL,
    slip_data      VARBINARY(MAX) NOT NULL,
    slip_mime      NVARCHAR(50)   NOT NULL DEFAULT 'image/jpeg',
    slip_filename  NVARCHAR(200)  NULL,
    confirmed_by   NVARCHAR(100)  NULL,
    confirmed_at   DATETIME2      NOT NULL DEFAULT GETDATE()
  );
  CREATE INDEX IX_payments_lead_step ON payments(lead_id, step_no);
END
GO
