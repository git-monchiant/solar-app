-- Install appointment confirmation (same pattern as survey_confirmed)
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'install_confirmed')
  ALTER TABLE leads ADD install_confirmed BIT NOT NULL CONSTRAINT DF_leads_install_confirmed DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'install_time_slot')
  ALTER TABLE leads ADD install_time_slot NVARCHAR(20) NULL;
GO
