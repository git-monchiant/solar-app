-- Add quotation_type to leads — captured during the Survey step's
-- ยืนยัน sub-step. Drives whether the OrderStep produces the standard
-- quotation template or a special/customised one.
USE solardb;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('leads') AND name = 'quotation_type'
)
BEGIN
  ALTER TABLE leads ADD quotation_type NVARCHAR(20) NULL;
END
GO

PRINT 'leads.quotation_type added';
GO
