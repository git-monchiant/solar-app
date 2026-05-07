-- Mirror prospects schema: add project_name (free-text fallback) and
-- project_alias (alternate display name). Lets seeker→lead sync land into
-- the same columns instead of dropping data.
--
-- Display rule (same as prospects):
--   COALESCE(NULLIF(project_name, N''), projects.name)
-- project_alias is the customer-facing alias when the official project name
-- is too long / ambiguous. NULL = use project_name / projects.name.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'project_name')
  ALTER TABLE leads ADD project_name NVARCHAR(200) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'project_alias')
  ALTER TABLE leads ADD project_alias NVARCHAR(200) NULL;
