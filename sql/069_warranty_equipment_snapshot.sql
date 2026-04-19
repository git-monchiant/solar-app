-- Warranty equipment snapshot — let staff enter actual installed equipment manually
-- at the warranty step (may differ from the package if on-site swaps happened).
IF COL_LENGTH('leads', 'warranty_system_size_kwp') IS NULL
  ALTER TABLE leads ADD warranty_system_size_kwp DECIMAL(6,2) NULL;
IF COL_LENGTH('leads', 'warranty_panel_count') IS NULL
  ALTER TABLE leads ADD warranty_panel_count INT NULL;
IF COL_LENGTH('leads', 'warranty_panel_watt') IS NULL
  ALTER TABLE leads ADD warranty_panel_watt INT NULL;
IF COL_LENGTH('leads', 'warranty_panel_brand') IS NULL
  ALTER TABLE leads ADD warranty_panel_brand NVARCHAR(100) NULL;
IF COL_LENGTH('leads', 'warranty_inverter_brand') IS NULL
  ALTER TABLE leads ADD warranty_inverter_brand NVARCHAR(100) NULL;
IF COL_LENGTH('leads', 'warranty_inverter_kw') IS NULL
  ALTER TABLE leads ADD warranty_inverter_kw DECIMAL(6,2) NULL;
IF COL_LENGTH('leads', 'warranty_battery_brand') IS NULL
  ALTER TABLE leads ADD warranty_battery_brand NVARCHAR(100) NULL;
IF COL_LENGTH('leads', 'warranty_battery_kwh') IS NULL
  ALTER TABLE leads ADD warranty_battery_kwh DECIMAL(6,2) NULL;
IF COL_LENGTH('leads', 'warranty_has_battery') IS NULL
  ALTER TABLE leads ADD warranty_has_battery BIT NULL;
