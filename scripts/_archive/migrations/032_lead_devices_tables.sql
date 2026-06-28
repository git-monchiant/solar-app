-- Per-lead device serials — splits warranty inverter/battery/panel data out of
-- the leads table into 3 dedicated tables. This keeps the leads row narrow,
-- lets multi-panel installs scale without big JSON blobs, and gives each
-- device-type its own native columns (kw vs kwh vs none).
--
-- App still reads/writes the old leads.warranty_* columns for now — column
-- drop happens in a later migration once UI is fully on the new tables.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'lead_inverters')
BEGIN
  CREATE TABLE dbo.lead_inverters (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_lead_inverters PRIMARY KEY,
    lead_id INT NOT NULL,
    brand NVARCHAR(100) NULL,
    kw DECIMAL(10,3) NULL,
    serial_no NVARCHAR(100) NULL,
    photo_url NVARCHAR(500) NULL,
    cert_url NVARCHAR(500) NULL,
    position INT NOT NULL CONSTRAINT DF_lead_inverters_position DEFAULT 0,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_lead_inverters_created_at DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_lead_inverters_updated_at DEFAULT GETDATE(),
    CONSTRAINT FK_lead_inverters_leads FOREIGN KEY (lead_id) REFERENCES dbo.leads(id) ON DELETE CASCADE
  );
  CREATE INDEX IX_lead_inverters_lead ON dbo.lead_inverters(lead_id);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'lead_batteries')
BEGIN
  CREATE TABLE dbo.lead_batteries (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_lead_batteries PRIMARY KEY,
    lead_id INT NOT NULL,
    brand NVARCHAR(100) NULL,
    kwh DECIMAL(10,3) NULL,
    serial_no NVARCHAR(100) NULL,
    photo_url NVARCHAR(500) NULL,
    position INT NOT NULL CONSTRAINT DF_lead_batteries_position DEFAULT 0,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_lead_batteries_created_at DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_lead_batteries_updated_at DEFAULT GETDATE(),
    CONSTRAINT FK_lead_batteries_leads FOREIGN KEY (lead_id) REFERENCES dbo.leads(id) ON DELETE CASCADE
  );
  CREATE INDEX IX_lead_batteries_lead ON dbo.lead_batteries(lead_id);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'lead_panels')
BEGIN
  CREATE TABLE dbo.lead_panels (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_lead_panels PRIMARY KEY,
    lead_id INT NOT NULL,
    brand NVARCHAR(100) NULL,
    serial_no NVARCHAR(100) NULL,
    position INT NOT NULL CONSTRAINT DF_lead_panels_position DEFAULT 0,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_lead_panels_created_at DEFAULT GETDATE(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_lead_panels_updated_at DEFAULT GETDATE(),
    CONSTRAINT FK_lead_panels_leads FOREIGN KEY (lead_id) REFERENCES dbo.leads(id) ON DELETE CASCADE
  );
  CREATE INDEX IX_lead_panels_lead ON dbo.lead_panels(lead_id);
END
GO
