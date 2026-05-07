-- Add package_note to leads — free-text note about the package selection
-- captured by the surveyor (e.g. customer-specific add-ons, exceptions).
-- Lives in SurveyStep step 4 (ยืนยัน), beneath the package picker.
USE solardb;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('leads') AND name = 'package_note'
)
BEGIN
  ALTER TABLE leads ADD package_note NVARCHAR(500) NULL;
END
GO

PRINT 'leads.package_note added';
GO
