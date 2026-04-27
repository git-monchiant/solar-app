-- Enforce one prospect per (project_id, house_number). Run AFTER the data
-- merge script has collapsed duplicates into a single row per house.
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'UX_prospects_project_house' AND object_id = OBJECT_ID('dbo.prospects')
)
BEGIN
  CREATE UNIQUE INDEX UX_prospects_project_house
    ON dbo.prospects(project_id, house_number)
    WHERE project_id IS NOT NULL AND house_number IS NOT NULL;
END;
