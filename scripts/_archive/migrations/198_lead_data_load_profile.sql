-- Customer Info · Lifestyle — the appliance load answers that fill the
-- Load Assumption table (§3) of the site survey report. One JSON document per
-- lead, same idea as ac_split: eight devices × two to four answers each would
-- be ~20 columns nobody filters on in SQL.
--
-- Shape and rules live in src/lib/load-assumption.ts. A device key that is
-- missing means "not asked yet" (the report leaves the row blank for hand
-- fill); { "qty": 0 } means "does not have one"; { "unknown": true } means the
-- customer could not say. AC hours are stored here, NOT in ac_split — Dashboard
-- III sums every value under ac_split.day/night as a machine count.
--
-- Plan: docs/plan/20260928-01-load-assumption-questionnaire.md

IF COL_LENGTH('dbo.lead_data', 'load_profile') IS NULL
  ALTER TABLE dbo.lead_data ADD load_profile NVARCHAR(MAX) NULL;
GO
