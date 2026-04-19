-- Audit log for PaymentSection actions. Captures every user interaction so we can
-- debug stale slips, verify mismatches, and replay what the UI actually did.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'payment_logs')
BEGIN
  CREATE TABLE payment_logs (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    lead_id     INT NOT NULL,
    slip_field  NVARCHAR(50) NULL,      -- e.g. "pre_slip_url", "order_before_slip"
    step_no     INT NULL,                -- 1..7 STEP_ORDER
    action      NVARCHAR(40) NOT NULL,   -- upload_start, upload_tmp_ok, verify_start, verify_success, verify_fail, slip_saved, slip_removed, confirm, unconfirm, error
    details     NVARCHAR(MAX) NULL,      -- JSON payload (expected_amount, verified_amount, error_msg, tmp_url, db_url, ...)
    user_id     INT NULL,                -- who did it (future auth)
    user_agent  NVARCHAR(400) NULL,
    created_at  DATETIME2 NOT NULL DEFAULT GETDATE()
  );

  CREATE INDEX idx_payment_logs_lead ON payment_logs(lead_id, created_at DESC);
  CREATE INDEX idx_payment_logs_action ON payment_logs(action, created_at DESC);
END
GO
