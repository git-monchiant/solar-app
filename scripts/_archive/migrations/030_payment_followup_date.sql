-- Lead/order-level payment follow-up ("ติดตามให้ชำระก่อนติดตั้ง N วัน").
-- Two fields so the checkbox state is independent of the computed date:
--   payment_followup_enabled — checkbox is ticked (intent)
--   payment_followup_date    — computed install_date − N (NULL until install
--                              date is known; no sentinel hack)
-- Reports: WHERE payment_followup_enabled = 1 / payment_followup_date BETWEEN …

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'payment_followup_date')
BEGIN
  ALTER TABLE dbo.leads ADD payment_followup_date DATE NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'payment_followup_enabled')
BEGIN
  ALTER TABLE dbo.leads ADD payment_followup_enabled BIT NOT NULL CONSTRAINT DF_leads_payment_followup_enabled DEFAULT 0;
END
GO
