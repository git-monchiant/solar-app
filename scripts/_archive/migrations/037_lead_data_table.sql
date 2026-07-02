-- lead_data — extracts the "ข้อมูล" tab of pre-survey (customer profile +
-- current energy use) out of the bloated `leads` table.
--
-- The 9 fields here are what PreSurveyForm captures; the rest of `pre_*`
-- (booking/payment state: pre_package_id, pre_slip_url, pre_doc_no,
-- pre_total_price, pre_survey_fee_type, pre_booked_at, plus pre_note for
-- the "อื่นๆ" tab) stays on leads because it's transactional, not profile.
--
-- API stays backwards compatible — GET /api/leads/[id] joins this table and
-- aliases columns back as `pre_xxx`, so callers don't notice the move. PATCH
-- on the same field names is routed to an UPSERT against lead_data.
--
-- Field names here drop the `pre_` prefix (the table name already tells you
-- it's pre-survey-bucket data).

IF OBJECT_ID('dbo.lead_data', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.lead_data (
    lead_id           INT             NOT NULL PRIMARY KEY,
    residence_type    NVARCHAR(50)    NULL,
    monthly_bill      DECIMAL(10, 2)  NULL,
    peak_usage        NVARCHAR(50)    NULL,
    electrical_phase  NVARCHAR(50)    NULL,
    wants_battery     NVARCHAR(50)    NULL,
    ac_units          NVARCHAR(MAX)   NULL,     -- CSV "9000:2,12000:1"
    appliances        NVARCHAR(MAX)   NULL,     -- CSV of appliance keys
    roof_shape        NVARCHAR(50)    NULL,
    bill_photo_url    NVARCHAR(500)   NULL,
    updated_at        DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_by_id     INT             NULL,
    CONSTRAINT FK_lead_data_lead FOREIGN KEY (lead_id) REFERENCES dbo.leads(id) ON DELETE CASCADE
  );
END
GO

-- Backfill — every existing lead gets a row mirroring its current pre_* values.
-- INSERT is idempotent: re-running the migration skips leads that already have
-- a row (e.g. created after an in-place re-deploy).
INSERT INTO dbo.lead_data (lead_id, residence_type, monthly_bill, peak_usage, electrical_phase, wants_battery, ac_units, appliances, roof_shape, bill_photo_url)
SELECT
  l.id,
  l.pre_residence_type,
  l.pre_monthly_bill,
  l.pre_peak_usage,
  l.pre_electrical_phase,
  l.pre_wants_battery,
  l.pre_ac_units,
  l.pre_appliances,
  l.pre_roof_shape,
  l.pre_bill_photo_url
FROM dbo.leads l
WHERE NOT EXISTS (SELECT 1 FROM dbo.lead_data d WHERE d.lead_id = l.id);
GO

-- Drop the moved columns from leads. Data lives in lead_data now; the old
-- columns would diverge silently if we kept them, since the app is being
-- switched to single-source-of-truth on lead_data.
IF COL_LENGTH('dbo.leads', 'pre_residence_type')    IS NOT NULL ALTER TABLE dbo.leads DROP COLUMN pre_residence_type;
GO
IF COL_LENGTH('dbo.leads', 'pre_monthly_bill')      IS NOT NULL ALTER TABLE dbo.leads DROP COLUMN pre_monthly_bill;
GO
IF COL_LENGTH('dbo.leads', 'pre_peak_usage')        IS NOT NULL ALTER TABLE dbo.leads DROP COLUMN pre_peak_usage;
GO
IF COL_LENGTH('dbo.leads', 'pre_electrical_phase')  IS NOT NULL ALTER TABLE dbo.leads DROP COLUMN pre_electrical_phase;
GO
IF COL_LENGTH('dbo.leads', 'pre_wants_battery')     IS NOT NULL ALTER TABLE dbo.leads DROP COLUMN pre_wants_battery;
GO
IF COL_LENGTH('dbo.leads', 'pre_ac_units')          IS NOT NULL ALTER TABLE dbo.leads DROP COLUMN pre_ac_units;
GO
IF COL_LENGTH('dbo.leads', 'pre_appliances')        IS NOT NULL ALTER TABLE dbo.leads DROP COLUMN pre_appliances;
GO
IF COL_LENGTH('dbo.leads', 'pre_roof_shape')        IS NOT NULL ALTER TABLE dbo.leads DROP COLUMN pre_roof_shape;
GO
IF COL_LENGTH('dbo.leads', 'pre_bill_photo_url')    IS NOT NULL ALTER TABLE dbo.leads DROP COLUMN pre_bill_photo_url;
GO
