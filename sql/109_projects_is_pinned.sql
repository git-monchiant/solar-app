-- Add is_pinned flag so seeker dashboard can keep certain projects (e.g.
-- "โครงการอื่นทั่วไป") at the top of the list regardless of activity volume.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('projects') AND name = 'is_pinned')
BEGIN
  ALTER TABLE dbo.projects ADD is_pinned BIT NOT NULL CONSTRAINT DF_projects_is_pinned DEFAULT 0;
END
GO

UPDATE dbo.projects SET is_pinned = 1 WHERE name = N'โครงการอื่นทั่วไป';
GO
