-- Free-text label that the seeker types in when a prospect lives under a
-- pinned ("catch-all") project like "โครงการอื่นทั่วไป". Kept separate from
-- the legacy `project_name` column so existing aggregations + sheet imports
-- don't have to change semantics.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('prospects') AND name = 'project_alias')
BEGIN
  ALTER TABLE dbo.prospects ADD project_alias NVARCHAR(200) NULL;
END
GO
