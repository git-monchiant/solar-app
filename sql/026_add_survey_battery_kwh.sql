-- Survey-side battery size selection (kWh). 0 = doesn't want, NULL = not answered.
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_battery_kwh')
BEGIN
  ALTER TABLE leads ADD survey_battery_kwh INT NULL;
END
GO
