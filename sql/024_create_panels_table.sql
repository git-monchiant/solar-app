-- PV module catalog + survey-side panel selection on lead
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'panels')
BEGIN
  CREATE TABLE panels (
    id INT IDENTITY(1,1) PRIMARY KEY,
    brand NVARCHAR(50) NOT NULL,
    model NVARCHAR(100) NULL,
    watt INT NOT NULL,
    tier NVARCHAR(20) NULL,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE()
  );
END
GO

-- Starter catalog — typical residential PV modules used in Thailand
IF NOT EXISTS (SELECT 1 FROM panels)
BEGIN
  INSERT INTO panels (brand, model, watt, tier) VALUES
    (N'JINKO', N'Tiger Neo N-Type', 635, N'Tier 1'),
    (N'JINKO', N'Tiger Neo N-Type', 580, N'Tier 1'),
    (N'JINKO', N'Tiger Pro', 540, N'Tier 1'),
    (N'Trina Solar', N'Vertex S+', 450, N'Tier 1'),
    (N'Trina Solar', N'Vertex', 545, N'Tier 1'),
    (N'Longi', N'Hi-MO 6', 580, N'Tier 1'),
    (N'Longi', N'Hi-MO 5', 545, N'Tier 1'),
    (N'Canadian Solar', N'HiKu6', 550, N'Tier 1'),
    (N'Canadian Solar', N'HiHero', 440, N'Tier 1');
END
GO

-- Survey-side panel selection
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_panel_id')
BEGIN
  ALTER TABLE leads ADD survey_panel_id INT NULL FOREIGN KEY REFERENCES panels(id);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_panel_count')
BEGIN
  ALTER TABLE leads ADD survey_panel_count INT NULL;
END
GO
