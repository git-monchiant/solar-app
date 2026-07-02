-- Questionnaire Section 2 — current energy profile additions.
--   monthly_bill_max  — peak/highest electricity bill the customer ever paid
--   meter_size        — PEA meter capacity at the household; pre-survey can
--                       capture it (rough) before Survey step records the
--                       authoritative survey_meter_size on leads.
--
-- monthly_bill, electrical_phase, peak_usage are already on lead_data via
-- migration 037 — this migration only adds the two new columns.

IF COL_LENGTH('dbo.lead_data', 'monthly_bill_max') IS NULL
  ALTER TABLE dbo.lead_data ADD monthly_bill_max DECIMAL(10, 2) NULL;
GO

IF COL_LENGTH('dbo.lead_data', 'meter_size') IS NULL
  ALTER TABLE dbo.lead_data ADD meter_size NVARCHAR(50) NULL;
GO
