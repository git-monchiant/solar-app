-- 049: Add decision_timeline column to lead_data.
--
-- New Decision Making Factor question on the PreSurvey form:
--   "ระยะเวลาในการตัดสินใจติดตั้ง" — 1-3 เดือน / 6 เดือน / มากกว่า 1 ปี / อื่นๆ
--
-- Stored alongside the rest of the §8 decision fields in lead_data. Single
-- string code with the "other:" prefix pattern (consistent with the rest of
-- the PreSurvey form): "1-3m" / "6m" / "1y+" / "other:<free-text>".

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.lead_data') AND name = 'decision_timeline'
)
BEGIN
  ALTER TABLE dbo.lead_data ADD decision_timeline NVARCHAR(200) NULL;
END
GO
