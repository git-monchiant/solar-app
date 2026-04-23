-- PDF §5 Photo Checklist — 4th slot: inverter mounting point.
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('leads') AND name = 'survey_photo_inverter_point_url')
  ALTER TABLE leads ADD survey_photo_inverter_point_url NVARCHAR(500) NULL;
GO
