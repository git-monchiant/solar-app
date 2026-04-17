USE solardb;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'project_name'
)
BEGIN
  ALTER TABLE prospects ADD project_name NVARCHAR(200) NULL;
END
GO

CREATE INDEX IX_prospects_project_name ON prospects(project_name) WHERE project_name IS NOT NULL;
GO
