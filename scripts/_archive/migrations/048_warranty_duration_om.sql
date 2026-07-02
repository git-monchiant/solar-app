-- 048: Add warranty_duration_years + warranty_om_per_year to leads.
--
-- DOCUMENT HEADER on Warranty subStep 0 gains two configurable steppers:
--   * ระยะเวลารับประกัน (ปี) — drives end-date calc (was hard-coded +2y)
--   * จำนวน O&M ครั้ง/ปี — for the maintenance schedule on the cert

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'warranty_duration_years'
)
BEGIN
  ALTER TABLE dbo.leads ADD warranty_duration_years INT NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'warranty_om_per_year'
)
BEGIN
  ALTER TABLE dbo.leads ADD warranty_om_per_year INT NULL;
END
GO
