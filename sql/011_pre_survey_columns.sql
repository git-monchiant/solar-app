-- Refactor: drop questionnaire JSON column, add first-class pre-survey columns
USE solardb;
GO

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'questionnaire')
BEGIN
  ALTER TABLE leads DROP COLUMN questionnaire;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'monthly_bill')
BEGIN
  ALTER TABLE leads ADD
    monthly_bill INT NULL,
    electrical_phase NVARCHAR(20) NULL,
    wants_battery NVARCHAR(20) NULL,
    roof_shape NVARCHAR(20) NULL,
    appliances NVARCHAR(200) NULL,
    peak_usage NVARCHAR(20) NULL,
    primary_reason NVARCHAR(50) NULL;
END
GO
