-- Drop survey_* columns that are no longer edited or displayed in the UI.
-- Zombie (previously editable, UI card removed):
--   survey_residence_type, survey_roof_age, survey_grid_type, survey_utility,
--   survey_ca_number, survey_peak_usage
-- Dead (legacy / never wired):
--   survey_ac_units, survey_battery_kwh, survey_inverter, survey_panel_id,
--   survey_surveyor_signature_url

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_residence_type')
  ALTER TABLE leads DROP COLUMN survey_residence_type;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_roof_age')
  ALTER TABLE leads DROP COLUMN survey_roof_age;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_grid_type')
  ALTER TABLE leads DROP COLUMN survey_grid_type;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_utility')
  ALTER TABLE leads DROP COLUMN survey_utility;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_ca_number')
  ALTER TABLE leads DROP COLUMN survey_ca_number;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_peak_usage')
  ALTER TABLE leads DROP COLUMN survey_peak_usage;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_ac_units')
  ALTER TABLE leads DROP COLUMN survey_ac_units;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_battery_kwh')
  ALTER TABLE leads DROP COLUMN survey_battery_kwh;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_inverter')
  ALTER TABLE leads DROP COLUMN survey_inverter;
GO
-- Drop FK constraint first, then the column.
DECLARE @fk nvarchar(256) = (SELECT name FROM sys.foreign_keys
                              WHERE parent_object_id = OBJECT_ID('leads')
                                AND OBJECT_NAME(referenced_object_id) IN ('panels')
                                AND EXISTS (SELECT 1 FROM sys.foreign_key_columns fc
                                            WHERE fc.constraint_object_id = foreign_keys.object_id
                                              AND COL_NAME(fc.parent_object_id, fc.parent_column_id) = 'survey_panel_id'));
IF @fk IS NOT NULL EXEC ('ALTER TABLE leads DROP CONSTRAINT ' + @fk);
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_panel_id')
  ALTER TABLE leads DROP COLUMN survey_panel_id;
GO
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_surveyor_signature_url')
  ALTER TABLE leads DROP COLUMN survey_surveyor_signature_url;
GO
