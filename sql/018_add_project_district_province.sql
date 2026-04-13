-- Add district + province columns to projects for location lookup
USE solardb;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'district')
BEGIN
  ALTER TABLE projects ADD district NVARCHAR(100) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'province')
BEGIN
  ALTER TABLE projects ADD province NVARCHAR(100) NULL;
END
GO
