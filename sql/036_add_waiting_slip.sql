USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'waiting_slip')
  ALTER TABLE leads ADD waiting_slip BIT NOT NULL CONSTRAINT DF_leads_waiting_slip DEFAULT 0;
GO
