-- Dedicated image for the Equipment Layout Sketch page in the survey report.
-- Kept separate from survey_photos so the PDF renderer can select it reliably.

IF NOT EXISTS (
  SELECT 1
  FROM sys.columns
  WHERE object_id = OBJECT_ID('leads')
    AND name = 'survey_layout_sketch_url'
)
  ALTER TABLE leads ADD survey_layout_sketch_url NVARCHAR(500) NULL;
GO
