-- Named photo slots from PDF §5 Photo Checklist (roof tab).
-- Stored alongside survey_photos (CSV of extras) so each required shot can
-- be validated + previewed on its own.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_photo_building_url')
  ALTER TABLE leads ADD survey_photo_building_url NVARCHAR(500) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_photo_roof_structure_url')
  ALTER TABLE leads ADD survey_photo_roof_structure_url NVARCHAR(500) NULL;
GO
