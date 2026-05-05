-- Extra fields needed by Scale Up packages — track the customer's existing
-- system size, panels being added, and per-component costs (battery, BMS,
-- panel). Most are NULL for non-Scale-Up rows.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('packages') AND name = 'existing_kw')
  ALTER TABLE packages ADD existing_kw DECIMAL(5,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('packages') AND name = 'additional_kwp')
  ALTER TABLE packages ADD additional_kwp DECIMAL(5,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('packages') AND name = 'battery_count')
  ALTER TABLE packages ADD battery_count INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('packages') AND name = 'battery_cost')
  ALTER TABLE packages ADD battery_cost DECIMAL(12,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('packages') AND name = 'bms_count')
  ALTER TABLE packages ADD bms_count INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('packages') AND name = 'bms_cost')
  ALTER TABLE packages ADD bms_cost DECIMAL(12,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('packages') AND name = 'panel_brand')
  ALTER TABLE packages ADD panel_brand NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('packages') AND name = 'panel_cost_per_unit')
  ALTER TABLE packages ADD panel_cost_per_unit DECIMAL(10,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('packages') AND name = 'remark')
  ALTER TABLE packages ADD remark NVARCHAR(MAX) NULL;
GO

-- Retire the legacy upgrade entries (10–16). They predate this brochure and
-- their pricing/specs don't match the new Scale Up catalog. Leaving them
-- visible would just confuse sales. Old IDs aren't deleted in case a lead
-- still references one via interested_package_id.
UPDATE packages SET is_active = 0 WHERE id IN (10, 11, 12, 13, 14, 15, 16);
GO

-- Group 2: Scale Up — Battery only (existing Huawei inverter required).
-- kwp here = system size AFTER upgrade (= existing_kw, since no new panels).
INSERT INTO packages (
  name, kwp, phase, has_battery, has_panel, has_inverter, is_upgrade, is_active,
  battery_kwh, battery_brand, battery_count, battery_cost,
  bms_count, bms_cost,
  existing_kw,
  price, remark
) VALUES
(N'Scale Up: เดิม 3 kW + Batt 7 kWh', 3.0, 1, 1, 0, 0, 1, 1, 7.0, N'HUAWEI', 1, 65000, 1, 29900, 3.0, 145000, N'สำหรับลูกค้าเดิมที่ติด HUAWEI inverter'),
(N'Scale Up: เดิม 5 kW + Batt 7 kWh', 5.0, 1, 1, 0, 0, 1, 1, 7.0, N'HUAWEI', 1, 65000, 1, 29900, 5.0, 145000, N'สำหรับลูกค้าเดิมที่ติด HUAWEI inverter'),
(N'Scale Up: เดิม 5 kW + Batt 14 kWh', 5.0, 1, 1, 0, 0, 1, 1, 14.0, N'HUAWEI', 2, 130000, 1, 29900, 5.0, 235000, N'สำหรับลูกค้าเดิมที่ติด HUAWEI inverter');
GO

-- Group 3: Scale Up — Battery + add panels. additional_kwp = panel kWp added.
-- kwp = post-upgrade system size.
INSERT INTO packages (
  name, kwp, phase, has_battery, has_panel, has_inverter, is_upgrade, is_active,
  battery_kwh, battery_brand, battery_count, battery_cost,
  bms_count, bms_cost,
  existing_kw, additional_kwp,
  solar_panels, panel_brand, panel_cost_per_unit,
  price, remark
) VALUES
(N'Scale Up: เดิม 3→5 kW + Batt 7 kWh',  5.0, 1, 1, 1, 0, 1, 1, 7.0,  N'HUAWEI', 1, 65000,  1, 29900, 3.0, 1.9, 3, N'TIER 1', 2880, 160000, N'เพิ่ม 3 แผง 1.9 kWp + Batt 7 kWh · ลูกค้า HUAWEI เท่านั้น'),
(N'Scale Up: เดิม 5→7 kW + Batt 7 kWh',  7.0, 1, 1, 1, 0, 1, 1, 7.0,  N'HUAWEI', 1, 65000,  1, 29900, 5.0, 1.9, 3, N'TIER 1', 2880, 160000, N'เพิ่ม 3 แผง 1.9 kWp + Batt 7 kWh · ลูกค้า HUAWEI เท่านั้น'),
(N'Scale Up: เดิม 5→7 kW + Batt 14 kWh', 7.0, 1, 1, 1, 0, 1, 1, 14.0, N'HUAWEI', 2, 130000, 1, 29900, 5.0, 1.9, 3, N'TIER 1', 2880, 250000, N'เพิ่ม 3 แผง 1.9 kWp + Batt 14 kWh · ลูกค้า HUAWEI เท่านั้น');
