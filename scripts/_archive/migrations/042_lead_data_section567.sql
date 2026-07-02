-- Questionnaire Sections 5 (Energy Security) + 6 (Home Health Check) + 7 (Beyond Question).
-- Bundled in one migration since each section is small (2 / 4 / 4 fields)
-- and all live on lead_data.

-- §5 Energy Security Assessment
IF COL_LENGTH('dbo.lead_data', 'outage_priorities')      IS NULL ALTER TABLE dbo.lead_data ADD outage_priorities      NVARCHAR(500) NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'bill_rise_action')       IS NULL ALTER TABLE dbo.lead_data ADD bill_rise_action       NVARCHAR(50)  NULL;
GO

-- §6 Home Health Check
IF COL_LENGTH('dbo.lead_data', 'had_roof_leak')          IS NULL ALTER TABLE dbo.lead_data ADD had_roof_leak          NVARCHAR(10)  NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'did_roof_repair')        IS NULL ALTER TABLE dbo.lead_data ADD did_roof_repair        NVARCHAR(10)  NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'had_electrical_issue')   IS NULL ALTER TABLE dbo.lead_data ADD had_electrical_issue   NVARCHAR(10)  NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'did_panel_replacement')  IS NULL ALTER TABLE dbo.lead_data ADD did_panel_replacement  NVARCHAR(10)  NULL;
GO

-- §7 Beyond Question
IF COL_LENGTH('dbo.lead_data', 'self_generates')         IS NULL ALTER TABLE dbo.lead_data ADD self_generates         NVARCHAR(10)  NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'ev_ready')               IS NULL ALTER TABLE dbo.lead_data ADD ev_ready               NVARCHAR(20)  NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'blackout_resilient')     IS NULL ALTER TABLE dbo.lead_data ADD blackout_resilient     NVARCHAR(10)  NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'future_usage_trend')     IS NULL ALTER TABLE dbo.lead_data ADD future_usage_trend     NVARCHAR(20)  NULL;
GO
