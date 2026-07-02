-- Questionnaire Section 3 — lifestyle assessment.
--
-- ac_split is JSON so we can carry the new day×size + night×size structure
-- without exploding lead_data into 10 INT columns. Old `ac_units` (simple
-- total counts per BTU, "9000:2,12000:1") stays for legacy reads; the form
-- writes to `ac_split` going forward.
--
-- yes/no fields stored as NVARCHAR so NULL = unanswered, "yes" / "no" =
-- explicit choices (matches the wants_battery pattern in PreSurveyForm).

IF COL_LENGTH('dbo.lead_data', 'home_at_daytime')      IS NULL ALTER TABLE dbo.lead_data ADD home_at_daytime      NVARCHAR(10)  NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'daytime_occupants')    IS NULL ALTER TABLE dbo.lead_data ADD daytime_occupants    NVARCHAR(200) NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'work_at_home')         IS NULL ALTER TABLE dbo.lead_data ADD work_at_home         NVARCHAR(10)  NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'business_type')        IS NULL ALTER TABLE dbo.lead_data ADD business_type        NVARCHAR(100) NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'work_days_per_week')   IS NULL ALTER TABLE dbo.lead_data ADD work_days_per_week   NVARCHAR(20)  NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'ac_split')             IS NULL ALTER TABLE dbo.lead_data ADD ac_split             NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'ev_charge_period')     IS NULL ALTER TABLE dbo.lead_data ADD ev_charge_period     NVARCHAR(20)  NULL;
GO
