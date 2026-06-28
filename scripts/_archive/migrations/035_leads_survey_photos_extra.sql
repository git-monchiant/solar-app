-- รูปสำรวจเพิ่มเติม — extra survey photos uploaded post-hoc from the Photos
-- tab on the lead detail page. Kept separate from survey_photos so the
-- original Survey step's photo gallery stays intact (and so the SurveyStep
-- save flow doesn't accidentally trample these).
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.leads') AND name = 'survey_photos_extra')
  ALTER TABLE dbo.leads ADD survey_photos_extra NVARCHAR(MAX) NULL;
GO
