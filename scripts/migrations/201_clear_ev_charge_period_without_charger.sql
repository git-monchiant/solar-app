-- ev_charge_period only means something when the customer HAS a charger
-- (lead_data.appliances contains 'ev'). Rows that carry a period without one
-- came from sales tapping "มี" to ask when a PLANNED EV would charge, then
-- switching back to "ไม่มี" — the form never cleared the period (45 rows on
-- solardb_dev after migration 200; 38 of them answered future_ev /
-- future_ev_charger = yes). They made 90% of Dashboard III's "ช่วงชาร์จ EV"
-- chart. The form now clears the period on "ไม่มี" and the API refuses a
-- period without a charger, so this is a one-time cleanup.
--
-- The old values are copied to lead_data_ev_charge_period_bak_20260928 first
-- (same _bak_<date> naming as scripts/tools/backup_tables.mjs), so they can
-- be restored with a join on lead_id. Drop that table once nobody needs it.
-- updated_at is left alone: a cleanup, not a new answer from the customer.
--
-- Idempotent: the backup keeps the first copy of each lead; re-running
-- clears nothing new.
--
-- Plan: docs/plan/20260928-01-load-assumption-questionnaire.md (D6)

IF OBJECT_ID('dbo.lead_data_ev_charge_period_bak_20260928', 'U') IS NULL
  CREATE TABLE dbo.lead_data_ev_charge_period_bak_20260928 (
    lead_id            INT           NOT NULL PRIMARY KEY,
    ev_charge_period   NVARCHAR(20)  NOT NULL,
    appliances         NVARCHAR(MAX) NULL,
    future_ev          NVARCHAR(20)  NULL,
    future_ev_charger  NVARCHAR(10)  NULL,
    backed_up_at       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
  );
GO

INSERT INTO dbo.lead_data_ev_charge_period_bak_20260928 (lead_id, ev_charge_period, appliances, future_ev, future_ev_charger)
SELECT d.lead_id, d.ev_charge_period, d.appliances, d.future_ev, d.future_ev_charger
FROM dbo.lead_data d
WHERE d.ev_charge_period IS NOT NULL
  AND N',' + REPLACE(ISNULL(d.appliances, N''), N' ', N'') + N',' NOT LIKE N'%,ev,%'
  AND NOT EXISTS (SELECT 1 FROM dbo.lead_data_ev_charge_period_bak_20260928 b WHERE b.lead_id = d.lead_id);
GO

UPDATE dbo.lead_data
SET ev_charge_period = NULL
WHERE ev_charge_period IS NOT NULL
  AND N',' + REPLACE(ISNULL(appliances, N''), N' ', N'') + N',' NOT LIKE N'%,ev,%';
GO
