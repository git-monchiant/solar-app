-- Rename inverter_sn → warranty_inverter_sn for consistent warranty_ naming
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'inverter_sn')
   AND NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'warranty_inverter_sn')
BEGIN
  EXEC sp_rename 'leads.inverter_sn', 'warranty_inverter_sn', 'COLUMN';
END
GO
