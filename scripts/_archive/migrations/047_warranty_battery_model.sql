-- 047: Add warranty_battery_model column to leads.
--
-- Warranty subStep 0 now has a BATTERY summary card mirroring Install §1.4
-- (ยี่ห้อ / รุ่น / ขนาด kWh). brand + kwh columns already exist; model is new.

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'warranty_battery_model'
)
BEGIN
  ALTER TABLE dbo.leads ADD warranty_battery_model NVARCHAR(200) NULL;
END
GO
