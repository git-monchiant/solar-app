-- Questionnaire Section 1 — house age, roof type already exists, occupancy.
-- Adds the not-yet-captured profile fields onto lead_data (the table
-- introduced in migration 037).
--
-- Roof type column `roof_shape` already exists from 037 but no UI captured it
-- before; this migration adds nothing new to roof_shape — PreSurveyForm picks
-- it up the same call.
--
-- Residence type, monthly bill, peak usage, electrical phase etc. were
-- already moved into lead_data by 037; nothing here touches those.

IF COL_LENGTH('dbo.lead_data', 'house_age') IS NULL
  ALTER TABLE dbo.lead_data ADD house_age NVARCHAR(20) NULL;
GO

IF COL_LENGTH('dbo.lead_data', 'occupant_total') IS NULL
  ALTER TABLE dbo.lead_data ADD occupant_total INT NULL;
GO

IF COL_LENGTH('dbo.lead_data', 'occupant_elderly') IS NULL
  ALTER TABLE dbo.lead_data ADD occupant_elderly INT NULL;
GO

IF COL_LENGTH('dbo.lead_data', 'occupant_kids') IS NULL
  ALTER TABLE dbo.lead_data ADD occupant_kids INT NULL;
GO

IF COL_LENGTH('dbo.lead_data', 'occupant_pets') IS NULL
  ALTER TABLE dbo.lead_data ADD occupant_pets INT NULL;
GO
