-- 144: in-app notifications and manual reminders for quotation approvals.
-- No LINE/customer messaging is involved.

IF OBJECT_ID('dbo.quotation_approval_notifications', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quotation_approval_notifications (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    quotation_id INT NOT NULL,
    lead_id INT NOT NULL,
    recipient_user_id INT NOT NULL,
    notification_type NVARCHAR(40) NOT NULL,
    approval_stage NVARCHAR(30) NULL,
    title NVARCHAR(250) NOT NULL,
    message NVARCHAR(1000) NULL,
    created_by INT NULL,
    read_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_qan_created DEFAULT GETDATE(),
    CONSTRAINT FK_qan_quotation FOREIGN KEY (quotation_id) REFERENCES dbo.quotations(id) ON DELETE CASCADE,
    CONSTRAINT FK_qan_lead FOREIGN KEY (lead_id) REFERENCES dbo.leads(id),
    CONSTRAINT FK_qan_recipient FOREIGN KEY (recipient_user_id) REFERENCES dbo.users(id),
    CONSTRAINT FK_qan_creator FOREIGN KEY (created_by) REFERENCES dbo.users(id)
  );

  CREATE INDEX IX_qan_recipient_unread
    ON dbo.quotation_approval_notifications(recipient_user_id, read_at, created_at DESC);
  CREATE INDEX IX_qan_quotation
    ON dbo.quotation_approval_notifications(quotation_id, created_at DESC);
END;
IF OBJECT_ID('dbo.quotation_approval_reminders', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.quotation_approval_reminders (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    quotation_id INT NOT NULL,
    approval_stage NVARCHAR(30) NOT NULL,
    reminded_by INT NOT NULL,
    reminded_at DATETIME2 NOT NULL CONSTRAINT DF_qar_reminded DEFAULT GETDATE(),
    CONSTRAINT FK_qar_quotation FOREIGN KEY (quotation_id) REFERENCES dbo.quotations(id) ON DELETE CASCADE,
    CONSTRAINT FK_qar_user FOREIGN KEY (reminded_by) REFERENCES dbo.users(id)
  );

  CREATE INDEX IX_qar_cooldown
    ON dbo.quotation_approval_reminders(quotation_id, approval_stage, reminded_at DESC);
END;
