-- Add house_number to leads. The form now treats บ้านเลขที่ as a distinct primary
-- identifier alongside project + installation_address (which holds the full
-- street address). prospects already has this column; mirror it on leads so
-- prospect→lead conversions don't lose the value.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'house_number')
  ALTER TABLE dbo.leads ADD house_number NVARCHAR(50) NULL;
GO
