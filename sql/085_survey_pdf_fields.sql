-- Survey fields to match the Solar PV Site Survey PDF (sections 2-6).
-- Section 2 — Electrical system
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_voltage_ln')
  ALTER TABLE leads ADD survey_voltage_ln DECIMAL(6,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_voltage_ll')
  ALTER TABLE leads ADD survey_voltage_ll DECIMAL(6,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_mdb_brand')
  ALTER TABLE leads ADD survey_mdb_brand NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_mdb_model')
  ALTER TABLE leads ADD survey_mdb_model NVARCHAR(100) NULL;
GO
-- CSV: "has_slot:3" / "full" / "other:note"
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_mdb_slots')
  ALTER TABLE leads ADD survey_mdb_slots NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_breaker_type')
  ALTER TABLE leads ADD survey_breaker_type NVARCHAR(50) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_panel_to_inverter_m')
  ALTER TABLE leads ADD survey_panel_to_inverter_m DECIMAL(6,2) NULL;
GO

-- Section 3 — Roof structure
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_roof_structure')
  ALTER TABLE leads ADD survey_roof_structure NVARCHAR(50) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_roof_width_m')
  ALTER TABLE leads ADD survey_roof_width_m DECIMAL(6,2) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_roof_length_m')
  ALTER TABLE leads ADD survey_roof_length_m DECIMAL(6,2) NULL;
GO

-- Section 4 — Installation planning
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_inverter_location')
  ALTER TABLE leads ADD survey_inverter_location NVARCHAR(30) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_wifi_signal')
  ALTER TABLE leads ADD survey_wifi_signal NVARCHAR(30) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_access_method')
  ALTER TABLE leads ADD survey_access_method NVARCHAR(30) NULL;
GO
