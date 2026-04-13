-- Keep only JINKO panels; remove others
USE solardb;
GO

-- Clear any references to non-JINKO panels first
UPDATE leads SET survey_panel_id = NULL
WHERE survey_panel_id IN (SELECT id FROM panels WHERE brand <> N'JINKO');
GO

DELETE FROM panels WHERE brand <> N'JINKO';
GO
