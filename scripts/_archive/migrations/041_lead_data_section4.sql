-- Questionnaire Section 4 — Future Home Assessment (5-year plans).
--
-- All 6 fields stored as NVARCHAR(10) so NULL means unanswered and the
-- ternary values (yes / no / considering / maybe) all fit cleanly.
--
-- future_battery is intentionally separate from the existing wants_battery
-- column (also on lead_data) — wants_battery captures immediate package
-- preference (drives filteredPackages in PreSurveyForm), while future_battery
-- is the 5-year horizon question from the questionnaire.

IF COL_LENGTH('dbo.lead_data', 'future_ev')           IS NULL ALTER TABLE dbo.lead_data ADD future_ev           NVARCHAR(20) NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'future_ev_charger')   IS NULL ALTER TABLE dbo.lead_data ADD future_ev_charger   NVARCHAR(10) NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'future_extend_home')  IS NULL ALTER TABLE dbo.lead_data ADD future_extend_home  NVARCHAR(10) NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'future_more_members') IS NULL ALTER TABLE dbo.lead_data ADD future_more_members NVARCHAR(10) NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'future_smart_home')   IS NULL ALTER TABLE dbo.lead_data ADD future_smart_home   NVARCHAR(10) NULL;
GO
IF COL_LENGTH('dbo.lead_data', 'future_battery')      IS NULL ALTER TABLE dbo.lead_data ADD future_battery      NVARCHAR(10) NULL;
GO
