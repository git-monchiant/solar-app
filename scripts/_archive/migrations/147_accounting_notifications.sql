-- 147: In-app notifications for Accounting payment review work.
-- Separate from quotation approval notifications so payment events can be
-- resolved independently without changing the quotation-specific schema.

IF OBJECT_ID('dbo.accounting_notifications', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.accounting_notifications (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    payment_id INT NULL,
    lead_id INT NOT NULL,
    slip_field NVARCHAR(50) NOT NULL,
    recipient_user_id INT NOT NULL,
    notification_type NVARCHAR(50) NOT NULL,
    event_key NVARCHAR(160) NOT NULL,
    title NVARCHAR(250) NOT NULL,
    message NVARCHAR(1000) NULL,
    target_url NVARCHAR(500) NOT NULL,
    created_by INT NULL,
    read_at DATETIME2 NULL,
    resolved_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_an_created DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_an_updated DEFAULT GETDATE(),
    CONSTRAINT FK_an_payment FOREIGN KEY (payment_id) REFERENCES dbo.payments(id) ON DELETE SET NULL,
    CONSTRAINT FK_an_lead FOREIGN KEY (lead_id) REFERENCES dbo.leads(id),
    CONSTRAINT FK_an_recipient FOREIGN KEY (recipient_user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_an_creator FOREIGN KEY (created_by) REFERENCES dbo.users(id),
    CONSTRAINT UQ_an_recipient_event UNIQUE (recipient_user_id, event_key)
  );

  CREATE INDEX IX_an_recipient_unread
    ON dbo.accounting_notifications(recipient_user_id, resolved_at, read_at, created_at DESC);
  CREATE INDEX IX_an_payment
    ON dbo.accounting_notifications(payment_id, notification_type, resolved_at);
  CREATE INDEX IX_an_lead_slip
    ON dbo.accounting_notifications(lead_id, slip_field, resolved_at);
END;

-- Seed work that is already waiting when this migration is deployed. Future
-- transitions are maintained by the application and reuse the same event key.
;WITH pending_work AS (
  SELECT
    p.id payment_id,
    p.lead_id,
    p.slip_field,
    CASE
      WHEN p.cheque_received_at IS NOT NULL THEN N'account_cheque_waiting_money'
      WHEN p.payment_method = 'cheque' THEN N'account_cheque_waiting_receive'
      ELSE N'account_payment_waiting_review'
    END notification_type,
    CASE
      WHEN p.cheque_received_at IS NOT NULL THEN N'รับเช็คแล้ว รอยืนยันเงินเข้าบริษัท'
      WHEN p.payment_method = 'cheque' THEN N'มีเช็ครอรับ'
      ELSE N'มีหลักฐานชำระเงินรอตรวจสอบ'
    END title,
    CONCAT(COALESCE(p.doc_no, p.payment_no, CONCAT('#', p.lead_id)), N' · ', CONVERT(NVARCHAR(30), CAST(p.amount AS DECIMAL(12,2))), N' บาท') message,
    CONCAT('/report/pending?payment_id=', p.id) target_url,
    p.submitted_by created_by,
    COALESCE(p.cheque_received_at, p.submitted_at, GETDATE()) created_at
  FROM dbo.payments p
  WHERE p.confirmed_at IS NULL
    AND ISNULL(p.cheque_status, '') NOT IN ('bounced', 'cancelled')
    AND (
      p.cheque_received_at IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM dbo.slip_files sf
        WHERE sf.lead_id = p.lead_id
          AND sf.slip_field = p.slip_field
          AND sf.submitted_at IS NOT NULL
      )
    )
)
INSERT dbo.accounting_notifications(
  payment_id, lead_id, slip_field, recipient_user_id, notification_type,
  event_key, title, message, target_url, created_by, created_at, updated_at
)
SELECT
  work.payment_id, work.lead_id, work.slip_field, u.id, work.notification_type,
  CONCAT(work.notification_type, ':', work.payment_id),
  work.title, work.message, work.target_url, work.created_by, work.created_at, GETDATE()
FROM pending_work work
CROSS JOIN dbo.users u
WHERE u.is_active = 1
  AND ISJSON(u.roles) = 1
  AND EXISTS (
    SELECT 1 FROM OPENJSON(u.roles) roles
    WHERE roles.[value] IN ('account', 'admin')
  )
  AND NOT EXISTS (
    SELECT 1 FROM dbo.accounting_notifications existing
    WHERE existing.recipient_user_id = u.id
      AND existing.event_key = CONCAT(work.notification_type, ':', work.payment_id)
  );
