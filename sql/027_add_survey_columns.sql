-- Survey-side fields: duplicates of pre_* (technician verifies on-site) + must-have on-site fields
USE solardb;
GO

-- Duplicates of pre_* (Survey-only copies)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_residence_type')
  ALTER TABLE leads ADD survey_residence_type NVARCHAR(30) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_monthly_bill')
  ALTER TABLE leads ADD survey_monthly_bill INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_peak_usage')
  ALTER TABLE leads ADD survey_peak_usage NVARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_appliances')
  ALTER TABLE leads ADD survey_appliances NVARCHAR(200) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_ac_units')
  ALTER TABLE leads ADD survey_ac_units NVARCHAR(200) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_roof_shape')
  ALTER TABLE leads ADD survey_roof_shape NVARCHAR(20) NULL;
GO

-- Must-have on-site fields (only the technician can know these)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_roof_material')
  ALTER TABLE leads ADD survey_roof_material NVARCHAR(40) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_roof_orientation')
  ALTER TABLE leads ADD survey_roof_orientation NVARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_floors')
  ALTER TABLE leads ADD survey_floors INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_roof_area_m2')
  ALTER TABLE leads ADD survey_roof_area_m2 INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_grid_type')
  ALTER TABLE leads ADD survey_grid_type NVARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_utility')
  ALTER TABLE leads ADD survey_utility NVARCHAR(10) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_ca_number')
  ALTER TABLE leads ADD survey_ca_number NVARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_meter_size')
  ALTER TABLE leads ADD survey_meter_size NVARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_db_distance_m')
  ALTER TABLE leads ADD survey_db_distance_m INT NULL;
GO

-- Nice-to-have on-site fields
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_shading')
  ALTER TABLE leads ADD survey_shading NVARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_roof_age')
  ALTER TABLE leads ADD survey_roof_age NVARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_roof_tilt')
  ALTER TABLE leads ADD survey_roof_tilt INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_access_distance')
  ALTER TABLE leads ADD survey_access_distance NVARCHAR(20) NULL;
GO
